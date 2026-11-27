export function productVariants(products, openedProduct) {
  const matching=products.filter(p=>p.menuCategory===openedProduct.menuCategory && p.displayName===openedProduct.displayName);
  const list=matching.some(p=>p.id===openedProduct.id)?matching:[...matching,openedProduct];
  const number=label=>parseFloat(String(label||'').match(/\d+[.,]?\d*/)?.[0].replace(',','.'))||0;
  return [...list].sort((a,b)=>number(a.sizeLabel)-number(b.sizeLabel));
}

export function productSheetHeight(height, topInset=0) {
  return Math.max(0,height-topInset-12);
}

// Size from usable space, including landscape safe areas and large system text.
// Long descriptions remain scrollable; the checkout dock never covers content.
export function productSheetLayout({width,height,topInset=0,bottomInset=0,leftInset=0,rightInset=0,fontScale=1}) {
  const sheetWidth=Math.max(0,Math.min(600,width-leftInset-rightInset));
  const sheetHeight=productSheetHeight(height,topInset);
  const padding=sheetWidth<360?16:20;
  const contentWidth=Math.max(0,sheetWidth-padding*2-2);
  const stackedFooter=contentWidth/Math.max(1,fontScale)<260;
  const scrollHeight=Math.max(0,sheetHeight-48-66-(stackedFooter?62:0)-Math.max(bottomInset,12));
  const photoHeight=Math.min(176,Math.max(88,Math.round(scrollHeight*.25/Math.max(1,fontScale))));
  return {sheetWidth,sheetHeight,padding,photoHeight,photoWidth:Math.min(240,contentWidth),tileWidth:Math.min(190,Math.max(0,(contentWidth-12)/2)),stackedFooter};
}

export function availableProductQuantity(inCart=0) {
  return Math.max(0,99-Math.max(0,Number(inCart)||0));
}

export function changeAdditionCount(counts,id,delta) {
  if(delta>0 && !counts[id] && Object.values(counts).filter(n=>n>0).length>=20) return counts;
  return {...counts,[id]:Math.max(0,Math.min(10,(counts[id]||0)+delta))};
}
