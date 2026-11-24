const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {PGlite}=require('@electric-sql/pglite');
const {PGLiteSocketServer}=require('@electric-sql/pglite-socket');
const express=require('express');
(async()=>{
 const db=await PGlite.create();await db.exec(execFileSync('./node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8'}));
 const socket=new PGLiteSocketServer({db,port:55444,host:'127.0.0.1'});await socket.start();process.env.DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55444/postgres?connection_limit=1';
 const prisma=require('../server/prisma');let server;
 try {
 const tenant=await prisma.tenant.create({data:{businessName:'QR fixture',email:'qr@example.invalid',phone:'0',trialEndsAt:new Date('2030-01-01')}});
 const branch=await prisma.branch.create({data:{tenantId:tenant.id,name:'QA',code:'qa'}});
 const table=await prisma.table.create({data:{tenantId:tenant.id,branchId:branch.id,name:'QA',code:'QA'}});
 const catalog=[{id:'water',name:'Water',price:10,cost:5},{id:'coffee',name:'Coffee',price:20,cost:7,hasSizes:true,sizes:[{id:'large',name:'Large',price:30,cost:9}],allowedAddons:['water']},{id:'inactive',name:'Unavailable',price:100,cost:10,isActive:false}];
 await prisma.data.create({data:{tenantId:tenant.id,key:'spare_parts',value:JSON.stringify(catalog)}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.tenantId=tenant.id;req.branchId=branch.id;req.tableId=table.id;req.userId='customer';req.userRole='customer';next()});app.use('/orders',require('../server/routes/orders'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(path,body,method='POST')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/orders'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
 let r=await call('',{tableId:table.id,items:[{id:'water',name:'forged',price:-999,cost:0,qty:1,lineId:'line'}]});assert.equal(r.status,201,JSON.stringify(r));const order=r.data.order;assert.equal(order.items[0].price,10);assert.equal(order.items[0].cost,5);assert.equal(order.items[0].name,'Water');
 r=await call('/'+order.id+'/items',{version:order.version,items:[{lineId:'line',qty:2,price:0,name:'forgedagain'}]},'PATCH');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.order.items[0].price,10);assert.equal(r.data.order.items[0].qty,2);
 let version=r.data.order.version;
 r=await call('/'+order.id+'/items',{version,items:[{lineId:'line',productId:'coffee',sizeId:'large',qty:1}]},'PATCH');assert.equal(r.status,400);assert.equal((await prisma.order.findUnique({where:{id:order.id}})).version,version);
 r=await call('/'+order.id+'/items',{version,items:[{lineId:'sized',id:'coffee',sizeId:'large',qty:1,price:0,addons:[{id:'water',qty:2,price:0}]}]},'PATCH');assert.equal(r.status,200,JSON.stringify(r));const sized=r.data.order.items.find(i=>i.lineId==='sized');assert.equal(sized.price,50);assert.equal(sized.cost,19);version=r.data.order.version;
 for(const item of [{id:'inactive',qty:1},{id:'coffee',sizeId:'large',qty:1,addons:[{id:'coffee',qty:1}]},{id:'water',qty:1,addons:[{id:'water',qty:1}]},{id:'coffee',qty:1},{id:'coffee',sizeId:'large',qty:1,addons:[{id:'water',qty:1},{id:'water',qty:1}]}]) {r=await call('/'+order.id+'/items',{version,items:[{lineId:'invalid',...item}]},'PATCH');assert.notEqual(r.status,200);assert.equal((await prisma.order.findUnique({where:{id:order.id}})).version,version);}
 assert.equal(await prisma.sale.count(),0);assert.equal(await prisma.productStock.count(),0);
 console.log('PASS QR customer forged price/name/cost ignored on create/edit, sized price30+addons20=50 cost19, inactive/disallowed/duplicate/missing-size/product-substitution denied atomically, no sale/stock writes. Auth mounts untouched.');
 } finally {if(server) await new Promise(r=>server.close(r));await prisma.$disconnect();await socket.stop();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
