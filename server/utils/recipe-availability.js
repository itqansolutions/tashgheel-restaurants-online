const {recipeLines,requiredRecipe}=require('./recipes');
function recipeAvailability(product,ingredients){
    if(!requiredRecipe(product))return {recipeAvailable:true,recipeUnavailableSizes:[]};
    const invalid=[];
    const check=item=>{try {recipeLines(product,{qty:1,...item},ingredients);return true;}catch(error){return false;}};
    let available;
    if(product.hasSizes){for(const size of product.sizes||[])if(!check({sizeId:size.id,sizeName:size.name}))invalid.push(String(size.id));available=(product.sizes||[]).some(size=>size.isActive!==false&&!invalid.includes(String(size.id)));}
    else available=check({});
    return {recipeAvailable:available,recipeUnavailableSizes:invalid};
}
function withRecipeAvailability(products,ingredients){return products.map(product=>({...product,...recipeAvailability(product,ingredients)}));}
module.exports={recipeAvailability,withRecipeAvailability};
