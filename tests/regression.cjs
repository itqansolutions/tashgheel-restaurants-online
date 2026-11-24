const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const express = require('express');
(async () => {
 const db = await PGlite.create();
 const sql = execFileSync('./node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8'});
 await db.exec(sql);
 const socket = new PGLiteSocketServer({db,port:55443,host:'127.0.0.1'});await socket.start();
 process.env.DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55443/postgres?connection_limit=1';
 const prisma = require('../server/prisma');
 let server;
 try {
 const tenant=await prisma.tenant.create({data:{businessName:'QA fixture',email:'fixture@example.invalid',phone:'0',trialEndsAt:new Date('2030-01-01')}});
 const branch=await prisma.branch.create({data:{tenantId:tenant.id,name:'QA',code:'qa'}});
 const user=await prisma.user.create({data:{tenantId:tenant.id,username:'qa',passwordHash:'not-a-login',fullName:'QA'}});
 const shift=await prisma.shift.create({data:{tenantId:tenant.id,branchId:branch.id,cashierId:user.id,openingCash:0}});
 const products=[{id:1,name:'Water',cost:5,price:10,itemType:'simple',stock:20},{id:2,name:'Service',cost:2,type:'service'},{id:3,name:'Coffee',type:'composite',hasSizes:true,sizes:[{id:'large',name:'Large',cost:7,recipe:[]}]}];
 await prisma.data.create({data:{tenantId:tenant.id,key:'spare_parts',value:JSON.stringify(products)}});
 await prisma.data.create({data:{tenantId:tenant.id,key:'products',value:'[]'}});
 await prisma.productStock.create({data:{tenantId:tenant.id,branchId:branch.id,productId:'1',qty:20}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.tenantId=tenant.id;req.branchId=branch.id;req.userId=user.id;req.user={role:'admin'};next()});app.use('/api/public',require('../server/routes/public-api'));app.use('/api/aggregators',require('../server/aggregators/aggregatorRouter'));app.use('/api/orders',require('../server/routes/orders'));app.use('/api',require('../server/routes/api'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,body)=>{const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 const sale={id:'QA-sale-1',receiptNo:'001',total:10,subtotal:10,items:[{id:1,name:'Water',qty:1,price:10,cost:999}]};
 let r=await call('/sales',sale);assert.equal(r.status,200,JSON.stringify(r));
 let stock=await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}});assert.equal(stock.qty,19);
 let saved=await prisma.sale.findUnique({where:{id:sale.id},include:{items:true}});assert.equal(saved.items[0].cost,5);
 console.log('PASS JSON-string catalog, forged cost ignored, stock20 ->19 once, sale cost5');
 r=await call('/sales',sale);assert.equal(r.status,200);assert.equal(r.data.replayed,true);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,19);console.log('PASS retry idempotent: one sale one deduction');
 r=await call('/sales',{...sale,total:11});assert.equal(r.status,409);console.log('PASS conflicting retry rejected');
 r=await call('/products/save',{product:{...products[0],stock:30,cost:5},expectedStock:19});assert.equal(r.status,200);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,30);
 r=await call('/data/read/spare_parts');assert.equal(r.data[0].stock,30);console.log('PASS atomic product+branch stock save and fresh read30');
 await prisma.productStock.updateMany({where:{tenantId:tenant.id,productId:'1'},data:{qty:19}});

 r=await call('/data/read/spare_parts');assert.equal(r.data[0].stock,19);console.log('PASS fresh branch read19');
 await prisma.data.update({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}},data:{value:JSON.stringify(products.map(p=>({...p,cost:8})))}});
 saved=await prisma.sale.findUnique({where:{id:sale.id},include:{items:true}});assert.equal(saved.items[0].cost,5);console.log('PASS historical cost preserved after catalog edit');
 r=await call('/sales',{...sale,id:'bad',items:[{id:999,name:'Unknown',qty:1,price:10}]});assert.equal(r.status,500);assert.equal(await prisma.sale.count({where:{id:'bad'}}),0);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,19);console.log('PASS unknown-product failure no sale or stock effect');
 r=await call('/sales',{...sale,id:'badqty',items:[{id:1,name:'Water',qty:-1,price:10}]});assert.equal(r.status,500);assert.equal(await prisma.sale.count({where:{id:'badqty'}}),0);console.log('PASS negative quantity rejected');
 const {snapshotItems}=require('../server/utils/catalog');assert.equal(snapshotItems([{id:3,sizeId:'large',qty:2}],products)[0].cost,7);console.log('PASS size cost snapshot');

 // True financial-transaction failure after stock mutation rolls back both sale and stock.
 const before = await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}});
 const countsBefore = await prisma.sale.count({where:{tenantId:tenant.id}});
 const pair = await Promise.all([call('/sales',{...sale,id:'concurrent',receiptNo:'C'}),call('/sales',{...sale,id:'concurrent',receiptNo:'C'})]);
 assert.ok(pair.some(x=>x.status===200));assert.equal(await prisma.sale.count({where:{id:'concurrent'}}),1);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,before.qty-1);console.log('PASS simultaneous same-id requests create one sale and one stock deduction');
 const replay=await call('/sales',{...sale,id:'concurrent',receiptNo:'C'});assert.equal(replay.status,200);
 const summary=await prisma.dailySummary.findFirst({where:{tenantId:tenant.id}});assert.ok(summary.totalCost>=5);console.log('PASS summary contains cost snapshot (async summary, not atomic)');

 for (const update of [{method:'card',splitCard:10},{items:[{...sale.items[0],sizeId:'x'}]},{items:[{...sale.items[0],addons:[{id:2,qty:1}]}]},{tax:1},{customer:{name:'Other'}}]) { r=await call('/sales',{...sale,...update});assert.equal(r.status,409); } console.log('PASS changed payment/split/size/addon/tax/customer retry rejected');
 let balance=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 r=await call('/sales',{...sale,id:'zero-addon',items:[{id:1,name:'Water',qty:1,price:10,addons:[{id:1,qty:0}]}]});assert.equal(r.status,500);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance);console.log('PASS zero-addon rejected before effects');
 r=await call('/sales',{...sale,id:'no-stock',items:[{id:1,name:'Water',qty:1000,price:10}]});assert.equal(r.status,409);assert.equal(await prisma.sale.count({where:{id:'no-stock'}}),0);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance);console.log('PASS insufficient simple stock rolls back sale');
 await prisma.data.update({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}},data:{value:JSON.stringify([...products,{id:4,name:'Recipe',itemType:'recipe',cost:3,price:10,recipe:[{ingredientId:9,qty:2}]}])}});
 await prisma.data.create({data:{tenantId:tenant.id,key:'ingredients',value:JSON.stringify([{id:9,name:'Raw',stock:20,stockByBranch:{[branch.id]:20},createdAt:new Date().toISOString()}])}});
 const recipeSale={...sale,id:'recipe-refund',items:[{id:4,name:'Recipe',qty:1,price:10,addons:[{id:1,qty:2}]}]};r=await call('/sales',recipeSale);assert.equal(r.status,200,JSON.stringify(r));
 let ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],18);assert.equal(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'4'}}),null);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance-2);console.log('PASS recipe ID match consumes ingredient2 plus addon2, no phantom parent balance');
 r=await call('/sales/refund/recipe-refund',{reason:'QA mixed intact addon',restockItems:[{productId:'1',qty:1,intact:true}]});assert.equal(r.status,200);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance-1);ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],18);let mixedAudit=await prisma.auditLog.findFirst({where:{action:'SALE_REFUND',details:{path:['saleId'],equals:'recipe-refund'}}});assert.equal(mixedAudit.details.recoveredCost,5);assert.equal(mixedAudit.details.retainedCost,8);console.log('PASS full mixed return: one of two intact addons restored, ingredient consumption remains, exact cost5 recovered/cost8 retained');
 const pure={...sale,id:'pure-prepared',items:[{id:4,name:'Recipe',qty:1,price:10}]};r=await call('/sales',pure);assert.equal(r.status,200);
 r=await call('/sales/refund/pure-prepared',{});assert.equal(r.status,400);
 r=await call('/sales/refund/pure-prepared',{reason:' ',restockItems:[]});assert.equal(r.status,400);
 r=await call('/sales/refund/pure-prepared',{reason:'QA prepared',restockItems:[{productId:'ingredient9',qty:1,intact:true}]});assert.equal(r.status,400);
 const consumedBefore=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value)[0].stockByBranch[branch.id];
 r=await call('/sales/refund/pure-prepared',{reason:'QA prepared',restockItems:[]});assert.equal(r.status,200,JSON.stringify(r));
 ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],consumedBefore);
 r=await call('/reports/history');const returned=r.data.sales.find(s=>s.id==='pure-prepared');assert.equal(returned.status,'refunded');assert.equal(returned.returnInfo.consumedCostRetained,true);assert.equal(returned.items[0].cost,3);console.log('PASS prepared return financial status+audit, zero ingredient increase, consumed cost retained/readable, no reason/type bypass');
 r=await call('/sales/refund/pure-prepared',{reason:'QA repeat',restockItems:[]});assert.ok(r.status>=400);
 // Restore test fixture only, not business data: align downstream independent stock expectations.
 await prisma.data.update({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}},data:{value:JSON.stringify(ing.map(i=>({...i,stock:20,stockByBranch:{[branch.id]:20}})))}});
 await prisma.productStock.updateMany({where:{tenantId:tenant.id,productId:'1'},data:{qty:balance}});
 const recipePair=await Promise.all(['recipe-a','recipe-b'].map(id=>call('/sales',{...sale,id,items:[{id:4,name:'Recipe',qty:1,price:10}]})));assert.ok(recipePair.every(x=>x.status===200));ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],16);console.log('PASS concurrent recipe sales ingredient20->16, no lost update');
 const p1={id:11,name:'P11',price:1,cost:1,stock:2,itemType:'simple'},p2={...p1,id:12,name:'P12'};
 const saves=await Promise.all([p1,p2].map(product=>call('/products/save',{product})));assert.ok(saves.every(x=>x.status===200));r=await call('/data/read/spare_parts');assert.ok(r.data.some(p=>p.id===11)&&r.data.some(p=>p.id===12));console.log('PASS concurrent distinct menu saves retain both products');

 // Independent return concurrency and tamper coverage on a new simple receipt.
 const returnBalance=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 r=await call('/sales',{...sale,id:'parallel-return',items:[{id:1,name:'Water',qty:2,price:10}]});assert.equal(r.status,200);
 for(const restockItems of [[{productId:'1',qty:3,intact:true}],[{productId:'1',qty:1,intact:false}],[{productId:'9',qty:1,intact:true}],[{productId:'1',qty:1,intact:true},{productId:'1',qty:1,intact:true}]]) {r=await call('/sales/refund/parallel-return',{reason:'QA invalid',restockItems});assert.equal(r.status,400);}
 const returns=await Promise.all([1,2].map(()=>call('/sales/refund/parallel-return',{reason:'QA concurrency',restockItems:[{productId:'1',qty:1,intact:true}]})));assert.equal(returns.filter(result=>result.status===200).length,1);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,returnBalance-1);assert.equal(await prisma.auditLog.count({where:{action:'SALE_REFUND',details:{path:['saleId'],equals:'parallel-return'}}}),1);console.log('PASS simultaneous intact returns one financial return, one selected unit increase, one audit; qty/condition/ingredient/duplicate tamper no effect');
 // Align independent downstream fixture balance only.
 await prisma.productStock.updateMany({where:{tenantId:tenant.id,productId:'1'},data:{qty:returnBalance}});
 const vendor=await prisma.vendor.create({data:{name:'QA vendor',tenantId:tenant.id,branchId:branch.id}});
 const material={id:77,name:'Flour',unit:'kg',cost:20,stock:10,vendorId:vendor.id};
 r=await call('/inventory/material',{material,expectedUpdatedAt:null});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.ingredients.find(i=>i.id===77).stock,10);assert.equal((await prisma.vendor.findUnique({where:{id:vendor.id}})).credit,200);
 const initial=r.data.ingredients.find(i=>i.id===77);r=await call('/inventory/material',{material,expectedUpdatedAt:initial.updatedAt,expectedStockRevision:initial.stockRevision});assert.equal(r.status,200);assert.equal((await prisma.vendor.findUnique({where:{id:vendor.id}})).credit,200);console.log('PASS linked material10kg/credit200 once, unchanged save no doubled stock/credit');
 const ledger=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'vendor_transactions_'+vendor.id,tenantId:tenant.id}}})).value);assert.equal(ledger.length,1);assert.equal(ledger[0].amount,200);console.log('PASS linked material one purchase ledger row, no expense/payment');
 r=await call('/inventory/material',{material:{...material,stock:12},expectedUpdatedAt:initial.updatedAt});assert.equal(r.status,409);console.log('PASS stale material save409');

 let reset=await fetch(base+'/api/sales/pure-prepared',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'finished'})});assert.equal(reset.status,409);
 // Even privileged legacy status mutation cannot erase durable restoration marker.
 await prisma.sale.update({where:{id:'pure-prepared'},data:{status:'finished'}});r=await call('/sales/refund/pure-prepared',{reason:'QA repeat',restockItems:[]});assert.equal(r.status,409);ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],16);console.log('PASS status reset blocked, durable refund audit prevents second restore after external reset');

 const stale=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);
 r=await call('/sales',{...sale,id:'stale-guard',items:[{id:4,name:'Recipe',qty:1,price:10}]});assert.equal(r.status,200);
 r=await call('/data/save',{key:'ingredients',value:stale});assert.equal(r.status,409);ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],14);console.log('PASS stale generic ingredient save409 cannot erase committed deduction');
 await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_reject_refund() RETURNS trigger AS $$ BEGIN IF NEW.action = 'SALE_REFUND' THEN RAISE EXCEPTION 'QA injected refund audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
 await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_refund_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION qa_reject_refund()`);
 r=await call('/sales/refund/stale-guard',{reason:'QA rollback',restockItems:[]});assert.equal(r.status,500);assert.equal((await prisma.sale.findUnique({where:{id:'stale-guard'}})).status,'finished');ing=JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value);assert.equal(ing[0].stockByBranch[branch.id],14);console.log('PASS injected refund audit failure rolls back status and ingredient restoration');
 await prisma.$executeRawUnsafe('DROP TRIGGER qa_refund_fail ON "AuditLog"');await prisma.$executeRawUnsafe('DROP FUNCTION qa_reject_refund()');

 const currentCatalog=await call('/data/read/spare_parts');const oldProduct=currentCatalog.data.find(p=>p.id===1);const originalBalance=oldProduct.stock;
 r=await call('/sales',{...sale,id:'menu-stale-race'});assert.equal(r.status,200);
 r=await call('/products/save',{product:{...oldProduct,stock:originalBalance},expectedStockRevision:oldProduct.stockRevision||null,expectedUpdatedAt:oldProduct.updatedAt||null,expectedStock:originalBalance,stockChanged:true});assert.equal(r.status,409);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,originalBalance-1);console.log('PASS stock expectedbalance409 blocks stale menu form from undoing sale');

 let list=await call('/data/read/ingredients');let vals=typeof list.data==='string'?JSON.parse(list.data):list.data;
 r=await call('/data/save',{key:'ingredients',value:vals});assert.equal(r.status,200);assert.ok(r.data.value[0].stockRevision);const vals2=r.data.value;
 r=await call('/data/save',{key:'ingredients',value:vals2});assert.equal(r.status,200);console.log('PASS returned revisions permit next confirmed generic save without refetch');
 r=await call('/products/save',{product:{id:444,name:'Delete fixture',stock:2,itemType:'simple'}});assert.equal(r.status,200);const deleting=r.data.product;
 r=await call('/data/remove-item',{key:'spare_parts',id:444,revision:'stale'});assert.equal(r.status,409);
 r=await call('/data/remove-item',{key:'spare_parts',id:444,revision:deleting.stockRevision});assert.equal(r.status,200);assert.ok(!r.data.value.some(x=>x.id===444));console.log('PASS deliberate fresh deletion succeeds and stale deletion fails');
 const table=await prisma.table.create({data:{tenantId:tenant.id,branchId:branch.id,name:'T1',code:'T1'}});
 r=await call('/orders',{tableId:table.id,items:[{id:1,name:'Water',qty:1,price:10}]});assert.equal(r.status,201,JSON.stringify(r));const orderId=r.data.order.id;
 const bal=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 const close=await call('/orders/'+orderId+'/close',{closeOverride:true});assert.equal(close.status,200,JSON.stringify(close));
 const din=await prisma.sale.findUnique({where:{id:close.data.saleId},include:{items:true}});assert.equal(din.items[0].cost,5);assert.equal(din.shiftId,shift.id);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,bal-1);
 r=await call('/orders/'+orderId+'/close',{closeOverride:true});assert.equal(r.status,200);assert.equal(r.data.alreadyClosed,true);assert.equal(r.data.saleId,din.id);
 r=await call('/sales/refund/'+din.id,{reason:'QA intact',restockItems:[{productId:'1',qty:1,intact:true}]});assert.equal(r.status,200);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,bal);console.log('PASS dine-in close current cost, branchstock once, exact refund, closed replay');
 r=await call('/orders',{tableId:table.id,items:[{id:1,name:'Water',qty:99999,price:10}]});assert.equal(r.status,201);const shortage=r.data.order.id;const count=await prisma.sale.count();r=await call('/orders/'+shortage+'/close',{closeOverride:true});assert.equal(r.status,409);assert.equal((await prisma.order.findUnique({where:{id:shortage}})).status,'open');assert.equal(await prisma.sale.count(),count);console.log('PASS dine-in shortage aborts sale/order/table changes');

 const ag=await prisma.aggregatorOrder.create({data:{tenantId:tenant.id,branchId:branch.id,provider:'fixture',providerOrderId:'fixture1',items:[{providerItemId:'1',name:'Water',qty:1,price:10}],financials:{total:10,vat:0}}});
 const agbefore=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 r=await call('/aggregators/orders/'+ag.id+'/accept',{});assert.equal(r.status,200,JSON.stringify(r));const agsale=r.data.saleId;
 r=await call('/aggregators/orders/'+ag.id+'/accept',{});assert.equal(r.status,200);assert.equal(r.data.replayed,true);assert.equal(r.data.saleId,agsale);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,agbefore-1);r=await call('/sales/refund/'+agsale,{reason:'QA intact',restockItems:[{productId:'1',qty:1,intact:true}]});assert.equal(r.status,200);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,agbefore);console.log('PASS aggregator exact stock, cost, durable replay, refund');
 await prisma.sale.create({data:{id:'ONLINE-TEST',tenantId:tenant.id,branchId:branch.id,total:10,status:'pending',source:'online_store',customer:{_stockSelections:[{saleItemId:'online-test-line',productId:'1',addons:[]}]},items:{create:[{id:'online-test-line',productId:'1',name:'Water',qty:1,price:10,cost:0}]}}});
 const finalize=async()=>{const r=await fetch(base+'/api/sales/ONLINE-TEST',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'finished',shiftId:shift.id})});return {status:r.status,data:await r.json()}};
 r=await finalize();assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.sale.items[0].cost,5);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,agbefore-1);r=await finalize();assert.equal(r.status,200);assert.equal(r.data.sale.newlyFinished,false);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,agbefore-1);console.log('PASS pending online finalize cost and stock exactly once');

 const late=await fetch(base+'/api/orders/'+orderId+'/items',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id:1,name:'Late',qty:1,price:10}]})});assert.equal(late.status,409);
 r=await call('/orders/'+orderId+'/cancel',{});assert.equal(r.status,409);
 r=await call('/orders',{tableId:table.id,items:[]});assert.equal(r.status,409);console.log('PASS closedorder edit/cancel rejected and occupiedtable duplicate creation rejected');

 r=await call('/data/read/spare_parts');const newCatalog=r.data;newCatalog.push({id:555,name:'SizedFixture',itemType:'service',allowedAddons:[1],hasSizes:true,sizes:[{id:'small',name:'Small',price:20,cost:7},{id:'large',name:'Large',price:30,cost:11}]});r=await call('/data/save',{key:'spare_parts',value:newCatalog});assert.equal(r.status,200);
 const table2=await prisma.table.create({data:{tenantId:tenant.id,branchId:branch.id,name:'T2',code:'T2'}});
 r=await call('/orders',{tableId:table2.id,items:[{id:555,sizeId:'small',name:'SizedFixture',qty:1,price:20}]});assert.equal(r.status,201);const sizeOrder=r.data.order;const sizeLine=sizeOrder.items[0];
 let change=await fetch(base+'/api/orders/'+sizeOrder.id+'/items',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:sizeOrder.version,items:[{lineId:sizeLine.lineId,qty:1,price:30,sizeId:'large',addons:[{id:1,qty:2}]}]})});assert.equal(change.status,200);
 const balance0=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 r=await call('/orders/'+sizeOrder.id+'/close',{closeOverride:true});assert.equal(r.status,200,JSON.stringify(r));let sized=await prisma.sale.findUnique({where:{id:r.data.saleId},include:{items:true}});assert.equal(sized.items[0].cost,21);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance0-2);console.log('PASS persisted existing dinein selection change Large plus addon2 closes correctcost21 andstock2');
 const addonAg=await prisma.aggregatorOrder.create({data:{tenantId:tenant.id,branchId:branch.id,provider:'fixture',providerOrderId:'fixture2',items:[{providerItemId:'1',name:'Water',qty:1,price:10,addons:[{id:1,qty:2}]}],financials:{total:10,vat:0}}});
 const balance1=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 r=await call('/aggregators/orders/'+addonAg.id+'/accept',{});assert.equal(r.status,200);let agplus=await prisma.sale.findUnique({where:{id:r.data.saleId},include:{items:true}});assert.equal(agplus.items[0].cost,15);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance1-3);console.log('PASS aggregator stored addon2 survives mapper and deducts3 cost15');
 r=await call('/public/order',{branchId:branch.id,customer:{name:'Fixture',mobile:'000'},orderType:'take_away',cart:[{id:555,sizeId:'large',qty:1,addons:[{id:1,qty:2}]}]});assert.equal(r.status,200,JSON.stringify(r));const publicId=r.data.orderId;
 const pending=await prisma.sale.findUnique({where:{id:publicId}});assert.equal(pending.customer._stockSelections[0].sizeId,'large');const balance2=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 change=await fetch(base+'/api/sales/'+publicId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'finished',shiftId:shift.id})});assert.equal(change.status,200,await change.text());sized=await prisma.sale.findUnique({where:{id:publicId},include:{items:true}});assert.equal(sized.items[0].cost,21);assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,balance2-2);console.log('PASS public sizedpending persistedselection finalized correctcost21 andaddonstock2');

 process.env.JWT_SECRET='fixture-only-secret';const jwt=require('jsonwebtoken');const secure=express();secure.use(express.json());secure.use(require('cookie-parser')());secure.use('/orders',require('../server/middleware/qrAuth'),require('../server/routes/orders'));const authServer=secure.listen(0,'127.0.0.1');await new Promise(r=>authServer.once('listening',r));
 try {
 const anotherBranch=await prisma.branch.create({data:{tenantId:tenant.id,name:'B2',code:'b2'}});const tenant2=await prisma.tenant.create({data:{businessName:'Other',email:'other@example.invalid',phone:'0',trialEndsAt:new Date('2030-01-01')}});const foreignBranch=await prisma.branch.create({data:{tenantId:tenant2.id,name:'Other',code:'other'}});
 const token=jwt.sign({user:{id:user.id,tenantId:tenant.id,role:'cashier',branchIds:[branch.id],defaultBranchId:branch.id}},process.env.JWT_SECRET);
 const secureCall=async(b)=>fetch('http://127.0.0.1:'+authServer.address().port+'/orders',{headers:{cookie:'token='+token,'x-branch-id':b}});
 let ar=await secureCall(branch.id);assert.equal(ar.status,200);ar=await secureCall(anotherBranch.id);assert.equal(ar.status,403);ar=await secureCall(foreignBranch.id);assert.equal(ar.status,404);console.log('PASS actual qrAuth signed staff cookie allowedbranch200, unassigned403, crossTenant404');
 const badShift=await prisma.shift.create({data:{tenantId:tenant.id,branchId:anotherBranch.id,cashierId:user.id,openingCash:0}});ar=await fetch(base+'/api/sales/ONLINE-TEST',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({shiftId:badShift.id})});assert.equal(ar.status,409);console.log('PASS online PATCH crossbranchshift denied');
 } finally {await new Promise(r=>authServer.close(r));}

 const guardApp=express();guardApp.use(express.json());guardApp.use(require('cookie-parser')());guardApp.use('/orders',require('../server/middleware/qrAuth'),require('../server/routes/orders'));const guardServer=guardApp.listen(0,'127.0.0.1');await new Promise(r=>guardServer.once('listening',r));
 try {
 const qrTable=await prisma.table.findUnique({where:{id:table2.id}});const qrToken=jwt.sign({role:'customer',tableId:qrTable.id,tenantId:tenant.id,branchId:branch.id},qrTable.qrSecret);const headers={Authorization:'Bearer '+qrToken,'Content-Type':'application/json'};
 let ar=await fetch('http://127.0.0.1:'+guardServer.address().port+'/orders/'+sizeOrder.id,{headers});assert.equal(ar.status,200);
 ar=await fetch('http://127.0.0.1:'+guardServer.address().port+'/orders/'+shortage,{headers});assert.equal(ar.status,404);
 ar=await fetch('http://127.0.0.1:'+guardServer.address().port+'/orders',{method:'POST',headers,body:JSON.stringify({tableId:table.id,items:[]})});assert.equal(ar.status,404);
 const forged=jwt.sign({role:'customer',tableId:qrTable.id,tenantId:tenant.id,branchId:'wrong-branch'},qrTable.qrSecret);ar=await fetch('http://127.0.0.1:'+guardServer.address().port+'/orders/'+sizeOrder.id,{headers:{Authorization:'Bearer '+forged}});assert.equal(ar.status,401);console.log('PASS signed QR token own table read200, other table read/create404, mismatched claims401');
 }finally {await new Promise(r=>guardServer.close(r));}

 await prisma.sale.create({data:{id:'LEGACY-ONLINE',tenantId:tenant.id,branchId:branch.id,total:10,status:'pending',source:'online_store',items:{create:[{productId:'1',name:'Water',qty:1,price:10,cost:0}]}}});const legacyBal=(await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty;
 let legacyResponse=await fetch(base+'/api/sales/LEGACY-ONLINE',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'finished',shiftId:shift.id,customer:{_stockSelections:[{productId:'1',addons:[]}]}})});assert.equal(legacyResponse.status,409);assert.equal((await legacyResponse.json()).code,'LEGACY_SELECTION_REVIEW_REQUIRED');assert.equal((await prisma.sale.findUnique({where:{id:'LEGACY-ONLINE'}})).status,'pending');assert.equal((await prisma.productStock.findFirst({where:{tenantId:tenant.id,productId:'1'}})).qty,legacyBal);console.log('PASS approved legacy online review409 cannot be bypassed through customer metadata, no effects');
 r=await call('/orders/'+sizeOrder.id+'/close',{closeOverride:true});assert.equal(r.status,200);assert.ok(r.data.alreadyClosed);assert.equal(r.data.sale.id,r.data.saleId);assert.equal(r.data.sale.receiptNo,r.data.receiptNo);assert.equal(r.data.sale.items[0].cost,21);console.log('PASS closed dinein retry returns persisted fullreceipt identity and items');
 // Event-date report API and branch-explicit inventory proof.
 await prisma.sale.update({where:{id:'pure-prepared'},data:{date:new Date('2026-11-20T10:00:00Z')}});
 await prisma.auditLog.updateMany({where:{action:'SALE_REFUND',details:{path:['saleId'],equals:'pure-prepared'}},data:{timestamp:new Date('2026-11-24T10:00:00Z')}});
 r=await call('/reports/return-events?branchId='+branch.id+'&from=2026-11-24T00:00:00Z&to=2026-11-24T23:59:59Z');assert.equal(r.status,200);assert.ok(r.data.events.some(event=>event.saleId==='pure-prepared'&&event.recoveredCost===0));
 r=await call('/reports/history?branchId='+branch.id+'&from=2026-11-20T00:00:00Z&to=2026-11-20T23:59:59Z');assert.ok(r.data.sales.some(sale=>sale.id==='pure-prepared'));console.log('PASS dated API originalsaleNov20 plus immutablefinancialreturnNov24 independentlyqueryable');
 const reportOtherBranch=await prisma.branch.create({data:{tenantId:tenant.id,name:'Other report branch',code:'report-other'}});
 const inventoryDoc=await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}});const inventoryRows=JSON.parse(inventoryDoc.value);inventoryRows[0].stock=100;inventoryRows[0].stockByBranch={[branch.id]:2,[reportOtherBranch.id]:98};await prisma.data.update({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}},data:{value:JSON.stringify(inventoryRows)}});
 r=await call('/reports/inventory?branchId='+branch.id);assert.equal(r.status,200);assert.equal(r.data.ingredients[0].stock,2);assert.deepEqual(Object.keys(r.data.ingredients[0].stockByBranch),[branch.id]);r=await call('/reports/inventory?branchId=all');assert.equal(r.data.ingredients[0].stock,100);console.log('PASS inventory API selectedingredient2 vsall100, selectedmapomitsotherbranch98');
 const staffApp=express();staffApp.use((req,res,next)=>{req.tenantId=tenant.id;req.branchId=branch.id;req.userId=user.id;req.user={role:'cashier',branchIds:[branch.id]};next()});staffApp.use('/api',require('../server/routes/api'));const staffServer=staffApp.listen(0,'127.0.0.1');await new Promise(resolve=>staffServer.once('listening',resolve));
 try {delete inventoryRows[0].stockByBranch;await prisma.data.update({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}},data:{value:JSON.stringify(inventoryRows)}});const response=await fetch('http://127.0.0.1:'+staffServer.address().port+'/api/reports/inventory?branchId=all');const restricted=await response.json();assert.equal(restricted.unknownBalances,true);assert.equal(restricted.ingredients[0].stock,0);assert.equal(restricted.ingredients[0].stockUnknown,true);assert.equal(restricted.ingredients[0].stockByBranch,undefined);console.log('PASS restrictedstaff allbranchcannotreceivelegacyflat100asverifiedbalance');} finally {await new Promise(resolve=>staffServer.close(resolve));}
 console.log('ALL BACKEND REGRESSIONS PASS');
 } finally {if(server)await new Promise(r=>server.close(r));await prisma.$disconnect();await new Promise(r=>setTimeout(r,100));await socket.stop();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
