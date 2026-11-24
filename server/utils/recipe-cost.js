const {requiredRecipe,recipeLines}=require('./recipes');
function calculateRecipeCost(product,ingredients){
 if(!requiredRecipe(product))return product;
 const calculate=(recipe,sizeId)=>{
  if(Array.isArray(recipe)&&recipe.length===0||recipe==null)return 0; // An incomplete draft remains unavailable, never an active zero-material recipe.
  const lines=recipeLines(product,{qty:1,sizeId},ingredients);
  return lines.reduce((sum,line)=>{const raw=line.ingredient.cost,cost=Number(raw);if(!(typeof raw==='number'||(typeof raw==='string'&&raw.trim()!==''))||!Number.isFinite(cost)||cost<0){const e=new Error('Recipe material cost needs review');e.status=409;throw e;}const next=sum+line.qty*cost;if(!Number.isFinite(next)){const e=new Error('Recipe cost is invalid');e.status=409;throw e;}return next;},0);
 };
 if(product.hasSizes){
  const ids=(product.sizes||[]).map(s=>s.id);if(ids.some(id=>id===undefined||id===null||String(id).trim()==='')||new Set(ids.map(String)).size!==ids.length){const e=new Error('Recipe sizes need unique identifiers');e.status=409;throw e;}
  const sizes=(product.sizes||[]).map(size=>({...size,cost:calculate(size.recipe,size.id)}));return {...product,sizes,cost:sizes.length?Math.min(...sizes.map(s=>s.cost)):0};}
 return {...product,cost:calculate(product.recipe)};
}
module.exports={calculateRecipeCost};
