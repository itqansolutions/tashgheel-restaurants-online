const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {PGlite}=require('@electric-sql/pglite');
const {PGLiteSocketServer}=require('@electric-sql/pglite-socket');
const express=require('express');
(async()=>{
 const db=await PGlite.create();await db.exec(execFileSync('./node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8'}));
 const socket=new PGLiteSocketServer({db,port:55446,host:'127.0.0.1'});await socket.start();process.env.DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55446/postgres?connection_limit=1';
 const prisma=require('../server/prisma');let server;
 try {
 const tenant=await prisma.tenant.create({data:{businessName:'QR fixture',email:'qr@example.invalid',phone:'0',trialEndsAt:new Date('2030-01-01')}});
 const branch=await prisma.branch.create({data:{tenantId:tenant.id,name:'QA',code:'qa'}});
 const user=await prisma.user.create({data:{tenantId:tenant.id,username:'qa',passwordHash:'not-a-login',fullName:'QA'}});const shift=await prisma.shift.create({data:{tenantId:tenant.id,branchId:branch.id,cashierId:user.id,openingCash:0}});
 const table=await prisma.table.create({data:{tenantId:tenant.id,branchId:branch.id,name:'QA',code:'QA'}});
 const recipe=[{ingredientId:'flour',qty:500,unit:'g',baseUnit:'kg',conversionFactor:.001,wasteType:'percent',wasteValue:20}];
 const catalog=[{id:'meal',name:'Meal',price:100,cost:62.5,itemType:'recipe',recipe},{id:'missing',name:'Missing',price:10,cost:1,itemType:'recipe',recipe:[]}];
 await prisma.data.create({data:{tenantId:tenant.id,key:'spare_parts',value:JSON.stringify(catalog)}});await prisma.data.create({data:{tenantId:tenant.id,key:'ingredients',value:JSON.stringify([{id:'flour',name:'Flour',unit:'kg',cost:100,stockByBranch:{[branch.id]:10,elsewhere:99},stock:109}])}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.tenantId=tenant.id;req.branchId=branch.id;req.userId=user.id;req.user={role:'admin'};req.userRole='staff';next()});app.use('/api/orders',require('../server/routes/orders'));app.use('/api/public',require('../server/routes/public-api'));app.use('/api',require('../server/routes/api'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(path,body,method='POST')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
 const balance=async()=>JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}})).value)[0];
 let r=await call('/sales',{id:'recipe-pos',receiptNo:'001',total:200,subtotal:200,items:[{id:'meal',name:'Meal',qty:2,price:100}],shiftId:shift.id});assert.equal(r.status,200,JSON.stringify(r));assert.equal((await balance()).stockByBranch[branch.id],8.75);
 r=await call('/orders',{tableId:table.id,items:[{id:'meal',qty:1,name:'Meal',price:100}]});assert.equal(r.status,201,JSON.stringify(r));const orderId=r.data.order.id;r=await call('/orders/'+orderId+'/close',{closeOverride:true});assert.equal(r.status,200,JSON.stringify(r));assert.equal((await balance()).stockByBranch[branch.id],8.125);
 r=await call('/public/order',{branchId:branch.id,customer:{name:'QA',mobile:'000'},orderType:'take_away',cart:[{id:'meal',qty:1}]});assert.equal(r.status,200,JSON.stringify(r));const onlineId=r.data.orderId;r=await call('/sales/'+onlineId,{status:'finished',shiftId:shift.id},'PATCH');assert.equal(r.status,200,JSON.stringify(r));assert.equal((await balance()).stockByBranch[branch.id],7.5);assert.equal((await balance()).stockByBranch.elsewhere,99);
 const read=async path=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path);return response.json()};const menu=await read('/public/menu/'+branch.id);assert.ok(menu.products.some(p=>p.id==='meal'));assert.ok(!menu.products.some(p=>p.id==='missing'));const projected=await read('/data/read/spare_parts');assert.equal(projected.find(p=>p.id==='missing').recipeAvailable,false);assert.equal(projected.find(p=>p.id==='meal').recipeAvailable,true);assert.equal(JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}}})).value).find(p=>p.id==='missing').recipeAvailable,undefined);
 const count=await prisma.sale.count();r=await call('/sales',{id:'recipe-shortage',total:10000,items:[{id:'meal',name:'Meal',qty:100,price:100}]});assert.equal(r.status,409,JSON.stringify(r));assert.equal(await prisma.sale.count(),count);assert.equal((await balance()).stockByBranch[branch.id],7.5);
 r=await call('/sales',{id:'recipe-missing',total:10,items:[{id:'missing',name:'Missing',qty:1,price:10}]});assert.equal(r.status,409,JSON.stringify(r));assert.equal(await prisma.sale.count(),count);assert.equal((await balance()).stockByBranch[branch.id],7.5);
 const audits=await prisma.auditLog.findMany({where:{tenantId:tenant.id,action:'SALE_CREATE'}});assert.equal(audits.length,3);assert.equal(audits.reduce((sum,audit)=>sum+audit.details.movements.filter(move=>move.kind==='ingredient').reduce((s,move)=>s+move.qty,0),0),2.5);
 console.log('PASS actual POS qty2 deduct1.25kg, dineclose qty1 deduct.625kg, onlinefinalize qty1 deduct.625kg; total2.5kg and3immutableaudit trails, otherbranch99 retained. Missingrecipe/shortage409 rolls back sale+stock. Stored costpolicy unchanged.');

 } finally {if(server) await new Promise(r=>server.close(r));await prisma.$disconnect();await socket.stop();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
