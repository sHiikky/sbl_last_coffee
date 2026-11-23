import React, { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, ClipPath, Polygon, Image as SvgImage } from 'react-native-svg';
import ProductImage from './ProductImage';
import SoftEdgeProductPhoto from './SoftEdgeProductPhoto';
import { photoTranslation } from '../lib/photoComposition';
import { productPhotoSource } from '../lib/productPhotoSource';

// The existing URL/editor frame stays authoritative. Only this exact latte
// source has a reviewed display mask for its opaque white floor.
export default function ProductSheetPhoto({ product, visual, frame, height = 184 }) {
  const id = 'latte'+useId().replace(/[^a-zA-Z0-9]/g,'');
  const [loadedSource,setLoadedSource]=useState(null);
  const translation=photoTranslation(frame,{width:240,height});
  if (visual.cutout === 'latte' && visual.source && frame.fit === 'contain') {
    return <View accessible accessibilityRole="image" accessibilityLabel={product.displayName || product.name} style={{width:240,height,alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      {loadedSource!==visual.source&&<View style={{position:'absolute',inset:0}}><ProductImage source={product.image} transparent aspectRatio={240/height} style={{width:240,height}} borderRadius={0} contentFit={frame.fit} zoom={frame.zoom} offsetX={frame.offsetX} offsetY={frame.offsetY}/></View>}
      <View style={{transform:[{translateX:translation.x},{translateY:translation.y},{scale:frame.zoom}]}}>
        <Svg width={height*400/900} height={height} viewBox="0 0 400 900">
          <Defs><ClipPath id={id}><Polygon points="0,0 400,0 400,684 384,774 364,801 320,831 260,843 180,846 120,839 60,821 24,793 8,738 0,630" /></ClipPath></Defs>
          <SvgImage key={visual.source} href={{uri:visual.source}} onLoad={()=>setLoadedSource(visual.source)} width="400" height="900" preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id})`} />
        </Svg>
      </View>
    </View>;
  }
  return <SoftEdgeProductPhoto product={{ ...product, image: productPhotoSource(product.image) }} frame={frame} height={height} />;
}
