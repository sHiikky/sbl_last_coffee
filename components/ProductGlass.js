import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/tokens';
import { productSheet as material } from '../theme/productSheet';

export default function ProductGlass({ children, selected = false, style }) {
  const corner=StyleSheet.flatten(style)?.borderRadius??radius.large;
  return <View style={[styles.wrap, selected && styles.selected, style]}>
    <BlurView pointerEvents="none" intensity={20} tint="dark" experimentalBlurMethod={Platform.OS === 'android' ? 'none' : undefined} style={[StyleSheet.absoluteFill,{borderRadius:corner,overflow:'hidden'}]} />
    <LinearGradient pointerEvents="none" colors={selected ? material.glassSelected : material.glass} start={{x:0,y:0}} end={{x:1,y:1}} style={[StyleSheet.absoluteFill,{borderRadius:corner}]} />
    <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.18)','rgba(255,255,255,0)']} style={styles.rim} />
    {children}
  </View>;
}
const styles=StyleSheet.create({
  wrap:{position:'relative',overflow:'hidden',borderRadius:radius.large,borderWidth:1,borderColor:material.border,backgroundColor:'rgba(255,255,255,0.035)'},
  selected:{borderColor:material.selectedBorder},
  rim:{position:'absolute',left:0,right:0,top:0,height:2},
});
