import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

export default function ProductAtmosphere({ visual, source }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <LinearGradient colors={visual.base} start={{x:1,y:0}} end={{x:.15,y:1}} style={StyleSheet.absoluteFill} />
    {!!source && <Image source={source} blurRadius={64} contentFit="cover" cachePolicy="memory-disk" style={[StyleSheet.absoluteFill,{opacity:.07}]} />}
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id="productAtmosphereGlow" cx="86%" cy="0%" rx="90%" ry="65%"><Stop offset="0" stopColor={visual.glow[0]} stopOpacity=".55"/><Stop offset="1" stopColor={visual.glow[0]} stopOpacity="0"/></RadialGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#productAtmosphereGlow)" />
    </Svg>
  </View>;
}
