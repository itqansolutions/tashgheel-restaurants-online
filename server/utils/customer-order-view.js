// Explicit guest view. Never send internal costs, staff identifiers or stock movements.
const pick=(source,keys)=>Object.fromEntries(keys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
function customerOrderView(req,order) {
 if(req.userRole!=='customer' || !order)return order;
 return {...pick(order,['id','tableId','tableName','status','version','isLocked','requestedBillAt','currentBatch','openedAt','lastActivityAt']),items:(order.items||[]).map(item=>{
  const selection=item.modifiers?.stockSelection||{};
  return {...pick(item,['id','lineId','productId','name','qty','price','note','kitchenStatus','batchNo','sentAt','readyAt']),modifiers:{stockSelection:{...pick(selection,['sizeId','sizeName']),addons:(selection.addons||[]).map(addon=>pick(addon,['id','name','qty','price']))}}};
 })};
}
module.exports={customerOrderView};
