window.recipeLineCost=function(line,ingredient){
 if(!ingredient)throw new Error('Recipe ingredient not found');
 const units={kg:{kg:1,g:.001},g:{g:1,kg:1000},l:{l:1,ml:.001},ml:{ml:1,l:1000},pcs:{pcs:1}};
 if(!(typeof ingredient.cost==='number'||(typeof ingredient.cost==='string'&&ingredient.cost.trim()!=='')))throw new Error('Recipe material cost needs review');
 const qty=Number(line.qty),waste=Number(line.wasteValue??line.wastePercent??0),kind=line.wasteType||'percent',cost=Number(ingredient.cost);
 if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(waste)||waste<0||!['fixed','percent'].includes(kind)||(kind==='percent'&&waste>=100)||!Number.isFinite(cost)||cost<0)throw new Error('Invalid recipe quantity, yield or material cost');
 let factor=Number(line.conversionFactor??1);
 if(line.unit&&ingredient.unit){factor=units[ingredient.unit]?.[line.unit];if(factor===undefined||(line.baseUnit&&line.baseUnit!==ingredient.unit))throw new Error('Review recipe units');}
 if(!Number.isFinite(factor)||factor<=0)throw new Error('Invalid recipe conversion');
 const total=(kind==='fixed'?qty+waste:qty/(1-waste/100))*factor*cost;
 if(!Number.isFinite(total))throw new Error('Invalid recipe cost');
 return total;
};
