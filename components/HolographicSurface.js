import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/tokens';
import { HOLOGRAPHIC_BASE, HOLOGRAPHIC_SPECTRUM, HOLOGRAPHIC_STOPS, HOLOGRAPHIC_HIGHLIGHT } from '../theme/holographic';
import { holographicMotion, acquireHolographicMotion } from '../lib/holographicMotion';
import useMotionPreference from '../hooks/useMotionPreference';

export default function HolographicSurface({
  // Retain old call sites while every geometry now uses the Home finish.
  variant = 'line', intensity = 1.35, animated = true, borderRadius = 0,
  direction = 'horizontal', style, children,
}) {
  const { reduceMotion } = useMotionPreference();
  const still = useRef(new Animated.Value(0.5)).current;
  const [width, setWidth] = useState(0);
  const motion = animated && !reduceMotion ? holographicMotion : still;
  useEffect(() => {
    if (!animated || reduceMotion) return undefined;
    return acquireHolographicMotion();
  }, [animated, reduceMotion]);

  // Normalize travel to the actual surface, not viewport: a small ring and a
  // full-width stripe show the same point of the same sweep at the same time.
  const travel = width * 1.35;
  const sweep = motion.interpolate({ inputRange: [0, 1], outputRange: [travel, -travel] });
  const drift = motion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [18, -18, 18] });
  const breath = motion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.98, 1.24, 1] });
  const strength = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity * 1.55)) : 1;
  const axis = { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };

  return (
    <View onLayout={event => { const measured = event.nativeEvent.layout.width; setWidth(previous => previous === measured ? previous : measured); }} style={[styles.wrap, { borderRadius }, style]}>
      <LinearGradient colors={HOLOGRAPHIC_BASE} locations={[0, 0.18, 0.45, 0.72, 1]} {...axis} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: drift }, { scaleX: 1.22 }] }]}>
        <LinearGradient colors={HOLOGRAPHIC_SPECTRUM} locations={HOLOGRAPHIC_STOPS} {...axis} style={[StyleSheet.absoluteFill, { opacity: strength }]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.lightPatch, { transform: [{ translateX: sweep }, { scaleX: breath }] }]}>
        <LinearGradient colors={HOLOGRAPHIC_HIGHLIGHT} locations={[0, 0.14, 0.34, 0.5, 0.68, 0.84, 1]} {...axis} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.04)']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', backgroundColor: colors.silverMid },
  lightPatch: { position: 'absolute', left: '-10%', top: -3, bottom: -3, width: '50%' },
});
