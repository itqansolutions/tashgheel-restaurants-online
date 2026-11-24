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
 const original=await prisma.data.findUnique({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}}});
 const product={...catalog[0],stock:0,cost:999,recipe:[{...recipe[0],costPerUnit:999}]};
 let r=await call('/products/save',{product});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.product.cost,62.5);const saved=r.data.product;
 let record=await prisma.data.findUnique({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}}});const before=record.value;
 r=await call('/products/save',{product:{...saved,recipe:[{...recipe[0],wasteValue:100}]},expectedStockRevision:saved.stockRevision,expectedUpdatedAt:saved.updatedAt});assert.equal(r.status,409);assert.equal((await prisma.data.findUnique({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}}})).value,before);
 const materials=await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}}});const data=JSON.parse(materials.value);data[0].cost=200;await prisma.data.update({where:{key_tenantId:{key:'ingredients',tenantId:tenant.id}},data:{value:JSON.stringify(data)}});
 assert.equal(JSON.parse((await prisma.data.findUnique({where:{key_tenantId:{key:'spare_parts',tenantId:tenant.id}}})).value)[0].cost,62.5);
 r=await call('/products/save',{product:{...saved,cost:0},expectedStockRevision:saved.stockRevision,expectedUpdatedAt:saved.updatedAt});assert.equal(r.status,200);assert.equal(r.data.product.cost,125);assert.equal(await prisma.sale.count(),0);assert.equal(await prisma.productStock.count(),0);console.log('PASS actual product-save API derives62.5 despite forged999, invalidyield409 atomic catalog unchanged, materialedit alone preserves standard62.5, explicitresave125, no sale/stock/historywrites.');
 } finally {if(server) await new Promise(r=>server.close(r));await prisma.$disconnect();await socket.stop();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
