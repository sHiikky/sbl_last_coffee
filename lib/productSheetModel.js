export function productVariants(products, openedProduct) {
  const matching=products.filter(p=>p.menuCategory===openedProduct.menuCategory && p.displayName===openedProduct.displayName);
  const list=matching.some(p=>p.id===openedProduct.id)?matching:[...matching,openedProduct];
  const number=label=>parseFloat(String(label||'').match(/\d+[.,]?\d*/)?.[0].replace(',','.'))||0;
  return [...list].sort((a,b)=>number(a.sizeLabel)-number(b.sizeLabel));
}

export function productSheetHeight(height, topInset=0) {
  return Math.max(0,Math.min(height*.88,height-topInset-12));
}

export function availableProductQuantity(inCart=0) {
  return Math.max(0,99-Math.max(0,Number(inCart)||0));
}

export function changeAdditionCount(counts,id,delta) {
  if(delta>0 && !counts[id] && Object.values(counts).filter(n=>n>0).length>=20) return counts;
  return {...counts,[id]:Math.max(0,Math.min(10,(counts[id]||0)+delta))};
}
