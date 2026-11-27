import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import ProductImage from './ProductImage';
import { fitProductPhoto } from '../lib/photoComposition';

// Preserve the source alpha on native and web. The former nested SVG gradient
// masks must not introduce extra transparency across the drink.
export default function SoftEdgeProductPhoto({ product, frame, height, width = 240 }) {
  const source=product.image;
  const uri=typeof source==='string'?source:source?.uri;
  const sourceKey=uri||source;
  const [dimensions,setDimensions]=useState(null);
  useEffect(()=>{
    let active=true;
    const accept=(sourceWidth,sourceHeight)=>{
      if(active&&sourceWidth>0&&sourceHeight>0)setDimensions({sourceKey,width:sourceWidth,height:sourceHeight});
    };
    if(uri)Image.getSize(uri,accept,()=>{});
    else if(typeof source==='number'){
      const asset=Image.resolveAssetSource(source);
      if(asset)accept(asset.width,asset.height);
    }
    return()=>{active=false;};
  },[sourceKey]);
  const fit=fitProductPhoto(dimensions?.sourceKey===sourceKey?dimensions:null,{width,height},frame);
  return <View accessible accessibilityRole="image" accessibilityLabel={product.displayName||product.name} style={{width,height,alignItems:'center',justifyContent:'center'}}>
    <View style={{width:fit.width,height:fit.height,transform:[{translateX:fit.x},{translateY:fit.y}]}}>
      <ProductImage source={source} transparent aspectRatio={fit.width/fit.height} style={{width:fit.width,height:fit.height}} borderRadius={0} contentFit="contain" zoom={1}/>
    </View>
  </View>;
}
