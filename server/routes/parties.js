const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// --- VENDORS ROUTES ---
router.get('/vendors', async (req, res) => {
    try {
        const { tenantId } = req;
        let vendors = await prisma.vendor.findMany({
            where: { tenantId }
        });

        // Viewing vendors must never reconcile credit or manufacture purchases.
        res.json(vendors);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vendors', async (req, res) => {
    try {
        const { tenantId, branchId } = req;
        const data = req.body;
        const id = data.id || data._id;

        let vendor;
        if (id) {
            // Verify ownership before updating
            const existing = await prisma.vendor.findUnique({ where: { id } });
            if (existing && existing.tenantId !== tenantId) {
                return res.status(403).json({ error: 'Access denied to this vendor' });
            }

            if (existing) {
                vendor = await prisma.vendor.update({
                    where: { id },
                    data: {
                        name: data.name,
                        mobile: data.mobile,
                        address: data.address,
                        credit: parseFloat(data.credit) || 0,
                        updatedAt: new Date()
                    }
                });
            } else {
                vendor = await prisma.vendor.create({
                    data: {
                        id: id.length === 36 ? id : undefined,
                        name: data.name,
                        mobile: data.mobile,
                        address: data.address,
                        credit: parseFloat(data.credit) || 0,
                        tenantId,
                        branchId
                    }
                });
            }
        } else {
            vendor = await prisma.vendor.create({
                data: {
                    name: data.name,
                    mobile: data.mobile,
                    address: data.address,
                    credit: parseFloat(data.credit) || 0,
                    tenantId,
                    branchId
                }
            });
        }
        res.json(vendor);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/vendors/:id', async (req, res) => {
    try {
        await prisma.vendor.deleteMany({
            where: { id: req.params.id, tenantId: req.tenantId }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /parties/vendors/:id/transactions — vendor ledger rows
router.get('/vendors/:id/transactions', async (req, res) => {
    try {
        const vendorId = req.params.id;
        const vendorTxKey = `vendor_transactions_${vendorId}`;
        let data = await prisma.data.findUnique({
            where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } }
        });

        let transactions = [];
        if (data && data.value) {
            transactions = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        }

        // Fallback: If no transactions found under the provided ID, check by vendor name or UUID
        if (!Array.isArray(transactions) || transactions.length === 0) {
            const vendor = await prisma.vendor.findFirst({
                where: {
                    tenantId: req.tenantId,
                    OR: [{ id: vendorId }, { name: vendorId }]
                }
            });
            if (vendor) {
                const altKey = vendor.id === vendorId ? `vendor_transactions_${vendor.name}` : `vendor_transactions_${vendor.id}`;
                const altData = await prisma.data.findUnique({
                    where: { key_tenantId: { key: altKey, tenantId: req.tenantId } }
                });
                if (altData && altData.value) {
                    const altTx = typeof altData.value === 'string' ? JSON.parse(altData.value) : altData.value;
                    if (Array.isArray(altTx) && altTx.length > 0) {
                        transactions = altTx;
                    }
                }


            }
        }

        res.json(Array.isArray(transactions) ? transactions : []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /parties/vendors/:id/transactions — manual payment against a vendor
router.post('/vendors/:id/transactions', async (req,res)=>{
    const reject=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
    try {
        const {type,amount,description,method='cash',date,notes,requestId}=req.body;
        const value=Number(amount);
        if(!['payment','purchase'].includes(type) || !Number.isFinite(value) || value<=0 || typeof amount==='boolean' || amount===null || typeof amount==='object') reject('Valid type and positive finite amount required');
        if((type==='payment' || requestId!==undefined) && (typeof requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) reject('A unique requestId is required');
        if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) reject('Valid date required');
        if(typeof method!=='string' || !method || method.length>40 || (description!==undefined && (typeof description!=='string' || description.length>1000)) || (notes!=null && (typeof notes!=='string' || notes.length>2000))) reject('Invalid payment details');
        const intent={type,amount:value,description:description|| (type==='payment'?'Manual Payment':'Manual Purchase'),method,date,notes:notes||null};
        const result=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            let vendor=await tx.vendor.findFirst({where:{id:req.params.id,tenantId:req.tenantId}});
            if(!vendor && type==='purchase') {
                const matches=await tx.vendor.findMany({where:{name:req.params.id,tenantId:req.tenantId},take:2});
                if(matches.length>1) reject('Ambiguous vendor needs review',409);
                vendor=matches[0];
            }
            if(!vendor) reject('Vendor not found',404);
            const key=`vendor_transactions_${vendor.id}`;
            const doc=await tx.data.findUnique({where:{key_tenantId:{key,tenantId:req.tenantId}}});
            let transactions=doc?(typeof doc.value==='string'?JSON.parse(doc.value):doc.value):[];
            if(!Array.isArray(transactions)) reject('Vendor history needs review',409);
            if(!transactions.length) {
                const legacy=await tx.data.findUnique({where:{key_tenantId:{key:`vendor_transactions_${vendor.name}`,tenantId:req.tenantId}}});
                const rows=legacy?(typeof legacy.value==='string'?JSON.parse(legacy.value):legacy.value):[];
                if(!Array.isArray(rows)||rows.length) reject('Legacy vendor history needs review before adding payment',409);
            }
            const existing=requestId?transactions.find(t=>t.requestId===requestId):null;
            if(existing) {
                if(JSON.stringify(existing.intent)!==JSON.stringify(intent)) reject('Request was already used for different payment details',409);
                return {success:true,replayed:true,transactionId:existing.id};
            }
            const transactionId=require('crypto').randomUUID();
            if(type==='payment') {
                const branchId=req.branchId||vendor.branchId||req.user?.defaultBranchId;
                const branch=branchId?await tx.branch.findFirst({where:{id:branchId,tenantId:req.tenantId}}):null;
                if(!branch) reject('Valid payment branch required',409);
                await tx.expense.create({data:{description:intent.description,amount:value,date,seller:vendor.name,method,notes:intent.notes,category:'Raw Materials',type:'vendor_payment',tenantId:req.tenantId,branchId:branch.id,createdBy:req.userId||'system'}});
            }
            transactions.push({id:transactionId,vendorId:vendor.id,...intent,requestId,intent,createdAt:new Date().toISOString()});
            await tx.data.upsert({where:{key_tenantId:{key,tenantId:req.tenantId}},update:{value:JSON.stringify(transactions),updatedAt:new Date()},create:{key,tenantId:req.tenantId,value:JSON.stringify(transactions)}});
            await tx.vendor.update({where:{id:vendor.id},data:{credit:{increment:type==='purchase'?value:-value}}});
            return {success:true,transactionId};
        });
        res.json(result);
    }catch(err){res.status(err.status||500).json({error:err.status?err.message:'Payment could not be saved. Check the statement before retrying with the same request.'});}
});


// --- CUSTOMERS ROUTES ---
router.get('/customers', async (req, res) => {
    try {
        const { tenantId } = req;
        const customers = await prisma.customer.findMany({
            where: { tenantId }
        });
        res.json(customers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/customers', async (req, res) => {
    try {
        const { tenantId, branchId } = req;
        const data = req.body;
        const id = data.id || data._id;

        let customer;
        if (id) {
            const existing = await prisma.customer.findUnique({ where: { id } });
            if (existing && existing.tenantId !== tenantId) {
                return res.status(403).json({ error: 'Access denied to this customer' });
            }

            if (existing) {
                customer = await prisma.customer.update({
                    where: { id },
                    data: {
                        name: data.name,
                        mobile: data.mobile,
                        notes: data.notes,
                        addresses: data.addresses,
                        loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                        updatedAt: new Date()
                    }
                });
            } else {
                customer = await prisma.customer.create({
                    data: {
                        id: id.length === 36 ? id : undefined,
                        name: data.name,
                        mobile: data.mobile,
                        notes: data.notes,
                        addresses: data.addresses,
                        loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                        tenantId,
                        branchId
                    }
                });
            }
        } else {
            customer = await prisma.customer.create({
                data: {
                    name: data.name,
                    mobile: data.mobile,
                    notes: data.notes,
                    addresses: data.addresses,
                    loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                    tenantId,
                    branchId
                }
            });
        }
        res.json(customer);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/customers/:id', async (req, res) => {
    try {
        await prisma.customer.deleteMany({
            where: { id: req.params.id, tenantId: req.tenantId }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

module.exports = router;
