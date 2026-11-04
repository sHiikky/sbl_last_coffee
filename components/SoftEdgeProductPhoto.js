import React, { useEffect, useId, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Mask, Rect, Image as SvgImage } from 'react-native-svg';
import ProductImage from './ProductImage';
import { photoTranslation } from '../lib/photoComposition';

// Feather only the outer 3% of the actual source, not the whole photo frame.
// This softens abruptly cropped shadows without blurring the drink or replacing
// the original asset. Unknown dimensions/load failures retain the normal image.
export default function SoftEdgeProductPhoto({ product, frame, height }) {
  const uri = typeof product.image === 'string' ? product.image : product.image?.uri;
  const [image, setImage] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const id = 'photoEdge' + useId().replace(/[^a-zA-Z0-9]/g, '');
  useEffect(() => {
    let active = true;
    if (uri) Image.getSize(uri, (width, sourceHeight) => {
      if (active && width > 0 && sourceHeight > 0) setImage({ uri, ratio: width / sourceHeight });
    }, () => {});
    return () => { active = false; };
  }, [uri]);
  const ready = image?.uri === uri && frame.fit === 'contain';
  const width = ready ? Math.min(240, height * image.ratio) : 240;
  const imageHeight = ready ? width / image.ratio : height;
  const translation = photoTranslation(frame, { width: 240, height });
  const label = product.displayName || product.name;
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: 240, height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {(!ready || loaded !== uri) && <View style={StyleSheet.absoluteFill}>
      <ProductImage source={product.image} transparent aspectRatio={240 / height} style={{ width: 240, height }} borderRadius={0} contentFit={frame.fit} zoom={frame.zoom} offsetX={frame.offsetX} offsetY={frame.offsetY} />
    </View>}
    {ready && <View pointerEvents="none" style={{ width, height: imageHeight, transform: [{ translateX: translation.x }, { translateY: translation.y }, { scale: frame.zoom }] }}>
      <Svg width={width} height={imageHeight} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id + 'x'} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="white" stopOpacity="0" /><Stop offset=".03" stopColor="white" /><Stop offset=".97" stopColor="white" /><Stop offset="1" stopColor="white" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={id + 'y'} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="white" stopOpacity="0" /><Stop offset=".03" stopColor="white" /><Stop offset=".97" stopColor="white" /><Stop offset="1" stopColor="white" stopOpacity="0" />
          </LinearGradient>
          <Mask id={id + 'vertical'} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><Rect width="100" height="100" fill={`url(#${id}y)`} /></Mask>
          <Mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><Rect width="100" height="100" fill={`url(#${id}x)`} mask={`url(#${id}vertical)`} /></Mask>
        </Defs>
        <SvgImage key={uri} href={{ uri }} width="100" height="100" preserveAspectRatio="none" mask={`url(#${id})`} onLoad={() => setLoaded(uri)} onError={() => setImage(null)} />
      </Svg>
    </View>}
  </View>;
}
