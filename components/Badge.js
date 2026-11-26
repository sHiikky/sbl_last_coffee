import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Text from './AppText';
import HolographicSurface from './HolographicSurface';
import { colors } from '../theme/tokens';
import badgeModel from '../kassa-terminal/product-badge';

export default function Badge({ type }) {
  const badge = badgeModel.parse(type);
  if (!badge.text) return null;
  return <View pointerEvents="none" style={[styles.badge, { backgroundColor: badge.style === 'black' ? '#151515' : colors.accent }]}>
    {badge.style === 'holo' && <HolographicSurface style={StyleSheet.absoluteFill} />}
    {badge.style === 'silver' && <LinearGradient colors={['#f5f6f7', '#c0c5ca', '#eef0f2']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} />}
    <Text style={[styles.text, ['silver','holo'].includes(badge.style) && styles.dark]} numberOfLines={2}>{badge.text}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { position:'absolute', top:8, right:8, maxWidth:'75%', minHeight:24,
    paddingHorizontal:7, paddingVertical:4, borderRadius:5, overflow:'hidden',
    alignItems:'center', justifyContent:'center' },
  text: { color:'#fff', fontSize:11, lineHeight:14, fontWeight:'800', letterSpacing:0.4, textTransform:'uppercase' },
  dark: { color:'#151515' },
});
