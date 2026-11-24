const express = require('express');
const router = express.Router();
/**
 * Orders Router (Hardened)
 *
 * Full lifecycle management for live dine-in open orders.
 * Auth: qrAuth middleware (accepts both staff JWT and customer QR token).
 * All DB writes use optimistic locking via `version` field.
 */

const prisma = require('../prisma');
const storage = require('../utils/storage');
const {readCatalog,snapshotItems,parseArray}=require('../utils/catalog');
const {applyStock}=require('../utils/stock');
const crypto=require('crypto');
const {customerOrderItems}=require('../utils/customer-order-items');
const {customerOrderView}=require('../utils/customer-order-view');

// ─── Structured logger ───────────────────────────────────────
function log(event, ctx = {}) {
    const parts = Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[DINE_IN] ${event} ${parts}`);
}

// ─── Helper: safe crypto.randomUUID fallback ───
function genLineId() {
    try { return require('crypto').randomUUID(); }
    catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}

// ─── Helper: enrich item costs from master product list ───
async function enrichCosts(items, tenantId) {
    const products=await readCatalog(prisma,tenantId);
    return items.map(item=>{
        const product=products.find(p=>String(p.id)===String(item.productId ?? item.id));
        return {...item,cost:product ? Number(product.cost||0) : Number(item.cost||0)};
    });
}

// @route  GET /api/orders
router.get('/', async (req, res) => {
    try {
        if (req.userRole === 'customer') return res.status(403).json({ error: 'Not authorized' });
        const orders = await prisma.order.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                status: 'open'
            },
            include: { items: true },
            orderBy: { openedAt: 'asc' }
        });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  GET /api/orders/table/:tableId
router.get('/table/:tableId', async (req, res) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                tableId: req.userRole==='customer'?req.tableId:req.params.tableId,
                status: 'open'
            },
            include: { items: true }
        });

        res.json(customerOrderView(req,order));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  GET /api/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });

        if (!order || order.tenantId !== req.tenantId || order.branchId !== req.branchId || (req.userRole==='customer' && order.tableId!==req.tableId)) return res.status(404).json({ error: 'Order not found' });
        res.json(customerOrderView(req,order));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders
const fail=(message,status=409)=>{const e=new Error(message);e.status=status;throw e};
async function lockedOrder(tx,req,allowLocked=false) {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
    const order=await tx.order.findUnique({where:{id:req.params.id},include:{items:true}});
    if(!order || order.tenantId!==req.tenantId || order.branchId!==req.branchId) fail('Order not found',404);
    if(req.userRole==='customer' && order.tableId!==req.tableId) fail('Order not found',404);
    if(order.status!=='open') fail('Order is not open');
    if(order.isLocked && !allowLocked) fail('The bill is being processed',423);
    return order;
}
router.post('/',async(req,res)=>{
    try {
        const order=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const table=await tx.table.findUnique({where:{id:req.body.tableId||''}});
            if(!table || table.tenantId!==req.tenantId || table.branchId!==req.branchId || (req.userRole==='customer' && table.id!==req.tableId)) fail('Table not found',404);
            if(table.activeOrderId) {const active=await tx.order.findUnique({where:{id:table.activeOrderId}});if(active?.status==='open') fail('Table already has an active order');}
            const input=req.body.items||[];
            const catalog=await readCatalog(tx,req.tenantId);
            const items=input.length?(req.userRole==='customer'?await customerOrderItems(tx,req.tenantId,input,catalog):snapshotItems(input,catalog)):[];
            const order=await tx.order.create({data:{tenantId:req.tenantId,branchId:req.branchId,tableId:table.id,tableName:table.name,note:req.body.note||'',openedBy:req.userRole==='customer'?'customer':req.userId||'waiter',items:{create:items.map(i=>({productId:String(i.id),productCode:i.code,name:i.name,qty:i.qty,price:i.price,cost:i.cost,note:i.note,addedBy:req.userRole==='customer'?'customer':req.userId||'waiter',lineId:i.lineId||genLineId(),modifiers:{stockSelection:{sizeId:i.sizeId,sizeName:i.sizeName,addons:i.addons||[]}}}))}},include:{items:true}});
            await tx.table.update({where:{id:table.id},data:{status:'occupied',activeOrderId:order.id}});return order;
        });res.status(201).json({success:true,order:customerOrderView(req,order)});
    }catch(err){res.status(err.status||500).json({error:err.message});}
});
router.patch('/:id/items',async(req,res)=>{
    try {
        const order=await prisma.$transaction(async tx=>{
            const order=await lockedOrder(tx,req);
            if(req.body.version!==undefined && req.body.version!==order.version) fail('Order was updated by someone else');
            if(!Array.isArray(req.body.items)) fail('items array required',400);
            const catalog=await readCatalog(tx,req.tenantId);
            for(const input of req.body.items) {
                const existing=order.items.find(i=>i.lineId===input.lineId);
                if(existing && existing.kitchenStatus!=='pending') fail('Item cannot be edited after sending to kitchen');
                const candidate={...(existing||{}),...(existing?.modifiers?.stockSelection||{}),...input};
                if(existing && String(input.productId ?? input.id ?? existing.productId)!==String(existing.productId)) fail('Product cannot be changed on an existing line',400);
                const item=(req.userRole==='customer'?await customerOrderItems(tx,req.tenantId,[candidate],catalog):snapshotItems([candidate],catalog))[0];
                const data={qty:item.qty,price:item.price,note:item.note,cost:item.cost,modifiers:{stockSelection:{sizeId:item.sizeId,sizeName:item.sizeName,addons:item.addons||[]}}};
                if(existing) await tx.orderItem.update({where:{id:existing.id},data});
                else await tx.orderItem.create({data:{...data,orderId:order.id,productId:String(item.id),productCode:item.productCode||item.code,name:item.name,addedBy:req.userRole==='customer'?'customer':req.userId||'waiter',lineId:item.lineId||genLineId(),modifiers:{stockSelection:{sizeId:item.sizeId,sizeName:item.sizeName,addons:item.addons||[]}}}});
            }
            return tx.order.update({where:{id:order.id},data:{version:{increment:1},lastActivityAt:new Date()},include:{items:true}});
        });res.json({success:true,version:order.version,order:customerOrderView(req,order)});
    }catch(err){res.status(err.status||500).json({error:err.message});}
});
router.delete('/:id/items/:lineId',async(req,res)=>{
    try{
        await prisma.$transaction(async tx=>{
            const order=await lockedOrder(tx,req);const item=order.items.find(i=>i.lineId===req.params.lineId);
            if(!item) fail('Item not found',404);
            if(['preparing','ready'].includes(item.kitchenStatus)) fail('Item is already being prepared');
            if(item.kitchenStatus==='sent' && req.userRole!=='staff') fail('Ask your waiter to cancel this item',403);
            await tx.orderItem.update({where:{id:item.id},data:{kitchenStatus:'cancelled',cancelledAt:new Date()}});
            await tx.order.update({where:{id:order.id},data:{version:{increment:1},lastActivityAt:new Date()}});
        });res.json({success:true});
    }catch(err){res.status(err.status||500).json({error:err.message});}
});

// @route  POST /api/orders/:id/send
router.post('/:id/send',async(req,res)=>{
    try{
        const result=await prisma.$transaction(async tx=>{
            const order=await lockedOrder(tx,req);const pending=order.items.filter(i=>i.kitchenStatus==='pending');
            if(!pending.length) fail('No pending items',400);
            const batchNo=order.currentBatch+1;const now=new Date();
            await tx.orderItem.updateMany({where:{orderId:order.id,kitchenStatus:'pending'},data:{kitchenStatus:'sent',sentAt:now,batchNo}});
            await tx.order.update({where:{id:order.id},data:{currentBatch:batchNo,version:{increment:1},lastActivityAt:now}});
            return {success:true,batchNo,sentCount:pending.length,version:order.version+1};
        });res.json(result);
    }catch(err){res.status(err.status||500).json({error:err.message});}
});
for(const action of ['lock','unlock','ready-all']) router.post('/:id/'+action,async(req,res)=>{
    if(req.userRole==='customer') return res.status(403).json({error:'Not authorized'});
    try{
        await prisma.$transaction(async tx=>{
            const order=await lockedOrder(tx,req,true);
            if(action==='ready-all') await tx.orderItem.updateMany({where:{orderId:order.id,kitchenStatus:{not:'cancelled'}},data:{kitchenStatus:'ready',readyAt:new Date()}});
            await tx.order.update({where:{id:order.id},data:{...(action==='lock'?{isLocked:true,requestedBillAt:order.requestedBillAt||new Date()}:action==='unlock'?{isLocked:false}:{}),version:{increment:1},lastActivityAt:new Date()}});
        });res.json({success:true});
    }catch(err){res.status(err.status||500).json({error:err.message});}
});

// @route  POST /api/orders/:id/close
router.post('/:id/close', async (req, res) => {
    if (req.userRole === 'customer') return res.status(403).json({error:'Not authorized'});
    try {
        const result=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const order=await tx.order.findUnique({where:{id:req.params.id},include:{items:true}});
            const fail=(message,status=409)=>{const e=new Error(message);e.status=status;throw e};
            if(!order || order.tenantId!==req.tenantId || order.branchId!==req.branchId) fail('Order not found',404);
            if(order.status==='closed') {
                const sale=await tx.sale.findUnique({where:{id:order.mappedSaleId||''},include:{items:true}});
                if(!sale || sale.tenantId!==req.tenantId || sale.branchId!==req.branchId) fail('Closed bill receipt needs review');
                return {success:true,alreadyClosed:true,saleId:sale.id,receiptNo:sale.receiptNo,total:sale.total,sale};
            }
            if(order.status!=='open') fail('Order is not open');
            const settingsDoc=await tx.data.findUnique({where:{key_tenantId:{key:'shop_settings',tenantId:req.tenantId}}});
            const settings=typeof settingsDoc?.value==='string'?JSON.parse(settingsDoc.value):settingsDoc?.value||{};
            if(settings.enableKitchen!==false && !req.body.closeOverride && order.items.some(i=>!['ready','cancelled'].includes(i.kitchenStatus))) fail('Some items are not ready yet');
            const items=snapshotItems(order.items.filter(i=>i.kitchenStatus!=='cancelled').map(i=>({...i,...(i.modifiers?.stockSelection||{})})),await readCatalog(tx,req.tenantId));
            const subtotal=items.reduce((sum,i)=>sum+i.price*i.qty,0);
            const discount=Number(req.body.discount||0),tax=Number(req.body.tax||0),splitCash=Number(req.body.splitCash||0),splitCard=Number(req.body.splitCard||0);
            if([discount,tax,splitCash,splitCard].some(x=>!Number.isFinite(x)||x<0)) fail('Invalid bill amount',400);
            const discountAmt=req.body.discountType==='percent'?subtotal*discount/100:req.body.discountType==='value'?discount:0;
            const total=Math.max(0,subtotal-discountAmt+tax);
            const shift=await tx.shift.findFirst({where:{tenantId:req.tenantId,branchId:req.branchId,status:'open',...(req.body.shiftId?{id:req.body.shiftId}:{})}});
            if(!shift) fail('No open shift found',403);
            const lastSale=await tx.sale.findFirst({where:{tenantId:req.tenantId,branchId:req.branchId},orderBy:{date:'desc'}});
            const receiptNo=String((parseInt((lastSale?.receiptNo||'').replace(/\D/g,''))||0)+1).padStart(4,'0');
            const sale=await tx.sale.create({data:{id:'REC-'+crypto.randomUUID(),receiptNo,tenantId:req.tenantId,branchId:req.branchId,cashier:req.userId||'cashier',orderType:'dine_in',tableId:order.tableId,tableName:order.tableName,subtotal,discount:discountAmt,tax,total,method:req.body.method||'cash',splitCash,splitCard,shiftId:shift.id,status:'finished',source:'pos',date:new Date(),items:{create:items.map(i=>({productId:String(i.id),productCode:i.productCode,name:i.name,qty:i.qty,price:i.price,cost:i.cost,note:i.note}))}}});
            const movements=await applyStock(tx,req.tenantId,req.branchId,items);
            await tx.auditLog.create({data:{tenantId:req.tenantId,branchId:req.branchId,userId:req.userId,action:'SALE_CREATE',details:{saleId:sale.id,orderId:order.id,total,movements},ipAddress:req.ip}});
            await tx.order.update({where:{id:order.id},data:{status:'closed',closedAt:new Date(),mappedSaleId:sale.id}});
            await tx.table.update({where:{id:order.tableId},data:{status:'available',activeOrderId:null}});
            return {success:true,saleId:sale.id,receiptNo,total,sale:await tx.sale.findUnique({where:{id:sale.id},include:{items:true}})};
        });
        res.json(result);
    } catch(err) {res.status(err.status||500).json({error:err.message});}
});

// @route  POST /api/orders/:id/cancel
router.post('/:id/cancel',async(req,res)=>{
    if(req.userRole==='customer') return res.status(403).json({error:'Not authorized'});
    try {
        await prisma.$transaction(async tx=>{
            const order=await lockedOrder(tx,req,true);
            await tx.order.update({where:{id:order.id},data:{status:'cancelled',closedAt:new Date()}});
            await tx.table.update({where:{id:order.tableId},data:{status:'available',activeOrderId:null}});
        });res.json({success:true});
    }catch(err){res.status(err.status||500).json({error:err.message});}
});

module.exports = router;
