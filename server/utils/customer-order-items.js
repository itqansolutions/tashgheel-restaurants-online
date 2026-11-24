const {customerItems}=require('./customer-items');
const {parseArray}=require('./catalog');
const {recipeLines,requiredRecipe}=require('./recipes');
// Validate structural recipe availability at acceptance without reserving stock.
async function customerOrderItems(client,tenantId,items,catalog){
 const selected=customerItems(items,catalog);
 const required=[];
 for(const item of selected){const product=catalog.find(p=>String(p.id)===String(item.id));if(requiredRecipe(product))required.push({product,item});for(const addon of item.addons||[]){const product=catalog.find(p=>String(p.id)===String(addon.id));if(requiredRecipe(product))required.push({product,item:{qty:addon.qty??1}});}}
 if(required.length){const document=await client.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId}}});const ingredients=parseArray(document?.value);for(const {product,item} of required)recipeLines(product,item,ingredients);}
 return selected;
}
module.exports={customerOrderItems};
