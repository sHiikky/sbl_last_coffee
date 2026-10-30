import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useMotionPreference from '../hooks/useMotionPreference';
import { satinCard } from '../theme/satinCard';

const FIRST_PASS_DELAY = 1500;
const PASS_DURATION = 3000;
const PASS_INTERVAL = 18000;

// A short material reflection followed by actual idle time. Never keep an
// infinite native animation running while the Home route/app is hidden.
export default function LoyaltyCardSheen({ width, height, enabled = true }) {
  const { reduceMotion } = useMotionPreference();
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setIsActive(state === 'active'));
    return () => subscription?.remove?.();
  }, []);
  useEffect(() => {
    if (!enabled || reduceMotion || !isActive || width <= 0 || height <= 0) { phase.setValue(0); return undefined; }
    let mounted = true;
    let timer;
    let animation;
    const play = () => {
      if (!mounted || AppState.currentState !== 'active') return;
      phase.setValue(0);
      animation = Animated.timing(phase, { toValue: 1, duration: PASS_DURATION, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false });
      animation.start();
      // The 18 seconds are start-to-start: 3 seconds of light, then 15 idle.
      timer = setTimeout(play, PASS_INTERVAL);
    };
    timer = setTimeout(play, FIRST_PASS_DELAY);
    return () => { mounted = false; clearTimeout(timer); animation?.stop(); phase.setValue(0); };
  }, [enabled, reduceMotion, isActive, width, height, phase]);

  if (!enabled || reduceMotion || !isActive || width <= 0 || height <= 0) return null;
  const beamWidth = width * 0.22;
  const beamHeight = height * 1.8;
  const left = -width * 0.2;
  const halfShear = Math.tan(20 * Math.PI / 180) * beamHeight / 2;
  const start = -left - beamWidth - halfShear - 16;
  const end = width - left + halfShear + 16;
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.beam, {
    left, top: -height * 0.4, width: beamWidth, height: beamHeight,
    opacity: phase.interpolate({ inputRange: [0, 0.13, 0.84, 1], outputRange: [0, 0.75, 0.75, 0] }),
    transform: [{ translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [start, end] }) }, { skewX: '-20deg' }],
  }]}>
    <LinearGradient colors={satinCard.sheen} locations={[0, 0.2, 0.5, 0.8, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}
const styles = StyleSheet.create({ beam: { position: 'absolute' } });
