// Validate a recipe and express its consumption in the ingredient's stored base unit.
const conversions={kg:{kg:1,g:.001},g:{g:1,kg:1000},l:{l:1,ml:.001},ml:{ml:1,l:1000},pcs:{pcs:1}};
function invalid(message){const error=new Error(message);error.status=409;throw error;}
function requiredRecipe(product){return ['recipe','composite'].includes(product.itemType||product.type);}
function selectedRecipe(product,item){
 const size=product.hasSizes?(product.sizes||[]).find(size=>String(size.id)===String(item.sizeId)||(item.sizeName&&size.name===item.sizeName)):null;
 if(product.hasSizes&&!size)invalid('Choose a valid product size');
 const recipe=size?size.recipe:product.recipe;
 if(requiredRecipe(product)&&(!Array.isArray(recipe)||!recipe.length))invalid('Product unavailable: required recipe is missing');
 if(recipe!=null&&!Array.isArray(recipe))invalid('Invalid recipe structure');
 return recipe||[];
}
function recipeLines(product,item,ingredients){
 const quantity=Number(item.qty);if(!Number.isFinite(quantity)||quantity<=0)invalid('Invalid product quantity');
 return selectedRecipe(product,item).map(line=>{
  const ingredient=ingredients.find(ingredient=>String(ingredient.id)===String(line.ingredientId));if(!ingredient)invalid('Recipe ingredient not found');
  const qty=Number(line.qty);const waste=Number(line.wasteValue??line.wastePercent??0);if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(waste)||waste<0)invalid('Invalid recipe quantity or waste');
  const wasteType=line.wasteType||'percent';if(!['fixed','percent'].includes(wasteType)||(wasteType==='percent'&&waste>=100))invalid('Invalid recipe yield');
  let factor=Number(line.conversionFactor??1);
  if(line.unit&&ingredient.unit){factor=conversions[ingredient.unit]?.[line.unit];if(factor===undefined)invalid('Recipe units cannot be converted');if(line.baseUnit&&line.baseUnit!==ingredient.unit)invalid('Ingredient base unit changed; review recipe');}
  if(!Number.isFinite(factor)||factor<=0)invalid('Invalid recipe conversion');
  const usage=(wasteType==='fixed'?qty+waste:qty/(1-waste/100))*quantity*factor;if(!Number.isFinite(usage)||usage<=0)invalid('Invalid recipe consumption');
  return {ingredient,qty:usage};
 });
}
module.exports={requiredRecipe,selectedRecipe,recipeLines};
