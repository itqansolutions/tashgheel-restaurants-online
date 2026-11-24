const express=require('express');
const crypto=require('crypto');
const prisma=require('../prisma');
const {snapshotItems,readCatalog}=require('../utils/catalog');
const {recipeLines}=require('../utils/recipes');
const {applyStock}=require('../utils/stock');
const router=express.Router();
const PREFIX='kitchen_draft_v1:';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message,status=409){throw Object.assign(new Error(message),{status});}
function stable(v){return JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])):v);}
function key(id){if(!uuid.test(id||''))fail('Valid draft UUID required',400);return PREFIX+id;}
function receipt(sale,d){
 const selections=d.receiptSelections||[];
 if(sale.items.some(i=>!selections.some(s=>s.saleItemId===i.id&&String(s.productId)===String(i.productId))))fail('Draft receipt line mapping needs review');
 return {...sale,customer:sale.customer&&Object.keys(sale.customer).some(k=>!k.startsWith('_'))?sale.customer:null,isKitchenDraftReceipt:true,appliedTaxes:(d.pricing?.currentOrderTaxes||[]).map(t=>({...t,amount:(d.subtotal-d.discount)*Number(t.percentage||0)/100})),items:sale.items.map(i=>{const s=selections.find(s=>s.saleItemId===i.id);return {...i,code:i.productCode,sizeId:s.sizeId,sizeName:s.sizeName,addons:s.addons||[],discount:{type:i.discountType,value:i.discountValue}};})};
}
function parse(doc){return doc?JSON.parse(doc.value):null;}
async function lock(tx,req){await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;}
async function get(tx,req){const d=parse(await tx.data.findUnique({where:{key_tenantId:{key:key(req.params.id),tenantId:req.tenantId}}}));if(!d||d.branchId!==req.branchId)fail('Draft not found',404);return d;}
async function save(tx,req,d){await tx.data.update({where:{key_tenantId:{key:key(d.id),tenantId:req.tenantId}},data:{value:JSON.stringify(d)}});}
const money=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0)fail('Invalid '+label,400);return v;};
const cents=v=>Math.round((v+Number.EPSILON)*100)/100;
router.use((req,res,next)=>{if(req.userRole==='customer'||req.user?.role==='customer')return res.status(403).json({error:'Staff only'});next();});
router.get('/',async(req,res)=>{try{const docs=await prisma.data.findMany({where:{tenantId:req.tenantId,key:{startsWith:PREFIX}}});res.json(docs.map(parse).filter(d=>d.branchId===req.branchId&&d.status==='open').sort((a,b)=>a.sentAt.localeCompare(b.sentAt)));}catch(e){res.status(e.status||500).json({error:e.message});}});
router.get('/:id',async(req,res)=>{try{res.json(await get(prisma,req));}catch(e){res.status(e.status||500).json({error:e.message});}});
router.post('/',async(req,res)=>{try{
 const body=req.body;key(body.id);if(Buffer.byteLength(JSON.stringify(body))>65536)fail('Draft too large',413);
 // Immutable kitchen snapshot. No stock reservation or sale is created here.
 const hash=crypto.createHash('sha256').update(stable(body)).digest('hex');
 const draft=await prisma.$transaction(async tx=>{await lock(tx,req);const old=parse(await tx.data.findUnique({where:{key_tenantId:{key:key(body.id),tenantId:req.tenantId}}}));if(old){if(old.branchId!==req.branchId||old.requestHash!==hash)fail('Draft id already used');return old;}
 if(!['take_away','delivery'].includes(body.orderType))fail('Use existing dine-in order workflow for tables',400);
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)fail('Invalid draft items',400);
 for(const i of body.items){if(typeof i.qty!=='number'||!Number.isFinite(i.qty)||i.qty<=0)fail('Invalid item quantity',400);if(!Array.isArray(i.addons||[]))fail('Invalid addons',400);}
 const catalog=await readCatalog(tx,req.tenantId);const items=snapshotItems(body.items,catalog).map(i=>({id:i.id,code:i.code||'',name:i.name||'',qty:i.qty,price:money(i.price,'price'),sizeId:i.sizeId||null,sizeName:i.sizeName||'',addons:i.addons||[],note:String(i.note||''),discount:i.discount||{type:'none',value:0}}));
 const doc=await tx.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:req.tenantId}}});const ingredients=doc?JSON.parse(doc.value):[];
 for(const i of items)for(const c of [i,...i.addons.map(a=>({id:a.id,qty:i.qty*(a.qty||1)}))])recipeLines(catalog.find(p=>String(p.id)===String(c.id)),c,ingredients);
 for(const i of items){if(!['none','value','percent'].includes(i.discount.type))fail('Invalid line discount',400);money(i.discount.value,'line discount');if(i.discount.type==='percent'&&i.discount.value>100)fail('Invalid line discount',400);if(i.discount.type==='value'&&i.discount.value>i.price*i.qty)fail('Line discount exceeds line total',400);}
 const subtotal=cents(items.reduce((s,i)=>s+i.price*i.qty,0));const discount=money(body.discount??0,'discount'),tax=money(body.tax??0,'tax'),deliveryFee=money(body.deliveryFee??0,'delivery fee');if(discount>subtotal)fail('Discount exceeds subtotal',400);
 const d={id:body.id,branchId:req.branchId,status:'open',kitchenStatus:'pending',version:1,sentAt:new Date().toISOString(),openedBy:req.userId,orderType:body.orderType,items,note:String(body.note||''),customer:body.customer||null,salesman:String(body.salesman||''),subtotal,discount,tax,deliveryFee,total:cents(subtotal-discount+tax+deliveryFee),requestHash:hash,pricing:body.pricing||{},intentFingerprint:JSON.stringify(Object.fromEntries(Object.entries(body).filter(([k])=>k!=='id')))};
 await tx.data.create({data:{key:key(d.id),tenantId:req.tenantId,value:JSON.stringify(d)}});return d;});res.json({success:true,draft});
}catch(e){res.status(e.status||500).json({error:e.message});}});
router.post('/:id/status',async(req,res)=>{try{const draft=await prisma.$transaction(async tx=>{await lock(tx,req);const d=await get(tx,req);if(d.status!=='open')fail('Draft is not open');const status=req.body.status;if(!['preparing','ready'].includes(status))fail('Invalid kitchen status',400);if(d.kitchenStatus==='ready'&&status!=='ready')fail('Cannot move kitchen state backwards');if(d.kitchenStatus!==status){d.kitchenStatus=status;d.version++;await save(tx,req,d);}return d;});res.json({success:true,draft});}catch(e){res.status(e.status||500).json({error:e.message});}});
router.post('/:id/close',async(req,res)=>{try{const result=await prisma.$transaction(async tx=>{await lock(tx,req);const d=await get(tx,req);
 const tender={method:req.body.method,splitCash:req.body.splitCash??0,splitCard:req.body.splitCard??0};if(!['cash','card','split','mobile','talabat_cash','talabat_visa'].includes(tender.method))fail('Invalid tender',400);money(tender.splitCash,'split cash');money(tender.splitCard,'split card');const closeHash=crypto.createHash('sha256').update(stable(tender)).digest('hex');
 if(d.status==='closed'){if(d.closeHash!==closeHash)fail('Draft already closed with different tender');const sale=await tx.sale.findUnique({where:{id:d.saleId},include:{items:true}});if(!sale||sale.tenantId!==req.tenantId||sale.branchId!==req.branchId)fail('Closed draft receipt needs review');return {success:true,alreadyClosed:true,sale:receipt(sale,d)};}
 if(d.status!=='open')fail('Draft is not open');if(tender.method==='split'&&Math.abs(cents(tender.splitCash+tender.splitCard)-d.total)>.01)fail('Split must equal total',400);
 const shift=await tx.shift.findFirst({where:{tenantId:req.tenantId,branchId:req.branchId,status:'open',...(req.body.shiftId?{id:req.body.shiftId}:{})}});if(!shift)fail('No open shift found',403);
 const items=snapshotItems(d.items,await readCatalog(tx,req.tenantId)).map(i=>({...i,saleItemId:crypto.randomUUID()}));
 d.receiptSelections=items.map(i=>({saleItemId:i.saleItemId,productId:String(i.id),sizeId:i.sizeId,sizeName:i.sizeName,addons:i.addons||[]}));
 const last=await tx.sale.findFirst({where:{tenantId:req.tenantId,branchId:req.branchId},orderBy:{date:'desc'}});const receiptNo=String((parseInt((last?.receiptNo||'').replace(/\D/g,''))||0)+1).padStart(4,'0');
 const sale=await tx.sale.create({data:{id:'REC-KOT-'+d.id,receiptNo,tenantId:req.tenantId,branchId:req.branchId,cashier:req.user?.username||req.userId||'cashier',salesman:d.salesman,shiftId:shift.id,total:d.total,subtotal:d.subtotal,discount:d.discount,tax:d.tax,deliveryFee:d.deliveryFee,method:tender.method,splitCash:tender.splitCash,splitCard:tender.splitCard,orderType:d.orderType,customer:d.customer||{},note:d.note,status:'finished',kitchenStatus:d.kitchenStatus==='ready'?'completed':d.kitchenStatus,source:'pos',items:{create:items.map(i=>({id:i.saleItemId,productId:String(i.id),productCode:i.code,name:i.name,qty:i.qty,price:i.price,cost:i.cost,note:i.note,discountType:i.discount?.type||'none',discountValue:i.discount?.value||0}))}},include:{items:true}});
 const movements=await applyStock(tx,req.tenantId,req.branchId,items);await tx.auditLog.create({data:{tenantId:req.tenantId,branchId:req.branchId,userId:req.userId,action:'SALE_CREATE',details:{saleId:sale.id,kitchenDraftId:d.id,total:sale.total,movements},ipAddress:req.ip}});
 const branch=await tx.branch.findUnique({where:{id:req.branchId}});const date=new Date().toLocaleDateString('en-CA',{timeZone:branch?.settings?.timezone||'Africa/Cairo'});
 const summary={totalRevenue:sale.total,totalOrders:1,totalDiscount:sale.discount,totalTax:sale.tax,totalCost:sale.items.reduce((s,i)=>s+i.cost*i.qty,0),cashTotal:sale.method==='cash'?sale.total:sale.method==='split'?sale.splitCash:0,cardTotal:sale.method==='card'?sale.total:sale.method==='split'?sale.splitCard:0,mobileTotal:sale.method==='mobile'?sale.total:0};
 await tx.dailySummary.upsert({where:{tenantId_branchId_date:{tenantId:req.tenantId,branchId:req.branchId,date}},create:{tenantId:req.tenantId,branchId:req.branchId,date,...summary},update:Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,{increment:v}]))});
 d.status='closed';d.saleId=sale.id;d.closedAt=new Date().toISOString();d.closeHash=closeHash;d.version++;await save(tx,req,d);return {success:true,sale:receipt(sale,d)};});res.json(result);}catch(e){res.status(e.status||500).json({error:e.message});}});
// No post-preparation cancellation/waste policy is implied or implemented.
module.exports=router;
module.exports.receipt=receipt;
