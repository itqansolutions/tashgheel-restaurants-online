const {snapshotItems,finite}=require('./catalog');
function customerItems(items,catalog) {
    if((items||[]).length>30) {const e=new Error('Too many items in one request');e.status=400;throw e;}
    return snapshotItems(items,catalog).map(item=>{
        if(!(item.qty>0 && item.qty<=20)) {const e=new Error('Quantity must be between 1 and 20');e.status=400;throw e;}
        const product=catalog.find(p=>String(p.id)===String(item.id));
        if(product.isActive===false) throw new Error('Product is unavailable');
        const size=product.hasSizes?(product.sizes||[]).find(s=>String(s.id)===String(item.sizeId)||(item.sizeName&&s.name===item.sizeName)):null;
        if(size?.isActive===false) throw new Error('Size is unavailable');
        let price=finite(size?.price??product.price??0,'catalog price');
        const seen=new Set();
        const addons=(item.addons||[]).map(addon=>{
            const id=String(addon.id);
            if(seen.has(id)) throw new Error('Duplicate add-on');
            seen.add(id);
            const master=catalog.find(p=>String(p.id)===id);
            if(!master || master.isActive===false || (!product.allowAllAddons && !(product.allowedAddons||[]).some(allowed=>String(allowed)===id))) throw new Error('Add-on is unavailable for this product');
            const qty=finite(addon.qty??1,'add-on quantity');
            price+=finite(master.price??0,'add-on price')*qty;
            return {id,qty};
        });
        if(!Number.isFinite(price)) throw new Error('Invalid catalog price');
        return {...item,productId:String(product.id),name:product.name,code:product.partNumber||product.code||'',productCode:product.partNumber||product.code||'',price,addons};
    });
}
module.exports={customerItems};
