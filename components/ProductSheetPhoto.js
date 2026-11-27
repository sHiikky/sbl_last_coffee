import React, { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, ClipPath, Polygon, Image as SvgImage } from 'react-native-svg';
import SoftEdgeProductPhoto from './SoftEdgeProductPhoto';
import { fitProductPhoto } from '../lib/photoComposition';
import { productPhotoSource } from '../lib/productPhotoSource';

// The existing URL/editor frame stays authoritative. Only this exact latte
// source has a reviewed display mask for its opaque white floor.
export default function ProductSheetPhoto({ product, visual, frame, height = 184, width = 240 }) {
  const id = 'latte'+useId().replace(/[^a-zA-Z0-9]/g,'');
  const [loadedSource,setLoadedSource]=useState(null);
  const fit=fitProductPhoto({width:400,height:900},{width,height},frame);
  if (visual.cutout === 'latte' && visual.source && frame.fit === 'contain') {
    return <View accessible accessibilityRole="image" accessibilityLabel={product.displayName || product.name} style={{width,height,alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      {loadedSource!==visual.source&&<View style={{position:'absolute',inset:0}}><SoftEdgeProductPhoto product={product} frame={frame} width={width} height={height}/></View>}
      <View style={{width:fit.width,height:fit.height,transform:[{translateX:fit.x},{translateY:fit.y}]}}>
        <Svg width={fit.width} height={fit.height} viewBox="0 0 400 900">
          <Defs><ClipPath id={id}><Polygon points="0,0 400,0 400,684 384,774 364,801 320,831 260,843 180,846 120,839 60,821 24,793 8,738 0,630" /></ClipPath></Defs>
          <SvgImage key={visual.source} href={{uri:visual.source}} onLoad={()=>setLoadedSource(visual.source)} width="400" height="900" preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id})`} />
        </Svg>
      </View>
    </View>;
  }
  return <SoftEdgeProductPhoto product={{ ...product, image: productPhotoSource(product.image) }} frame={frame} height={height} width={width} />;
}
