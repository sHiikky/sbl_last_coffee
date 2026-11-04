import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, View, Vibration, useWindowDimensions } from 'react-native';
import Text from './AppText';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import useMotionPreference from '../hooks/useMotionPreference';
import { colors, spacing } from '../theme/tokens';
import BrandLogo from './BrandLogo';

const READ_TIME = 400;
const SWEEP_TIME = 2600;
const EXIT_TIME = 300;
const BEAM_ANGLE = 18;

export default function BrandLaunch({ ready, onDone }) {
  const { reduceMotion, ready: preferenceReady } = useMotionPreference();
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(1)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  const completed = useRef(false);
  const nativeHidden = useRef(false);
  const pulsed = useRef(false);
  const [finished, setFinished] = useState(false);
  const callback = useRef(onDone);
  callback.current = onDone;

  // The beam spans the screen diagonal, not just the logo frame. Its rotated
  // bounds begin and finish beyond the viewport at every phone orientation.
  const beamWidth = Math.max(180, width * 0.72);
  const beamHeight = Math.hypot(width, height) + beamWidth * 2;
  const radians = BEAM_ANGLE * Math.PI / 180;
  const rotatedHalfWidth = (beamWidth * Math.cos(radians) + beamHeight * Math.sin(radians)) / 2;
  const travel = width / 2 + rotatedHalfWidth + spacing.xxl;
  const logoWidth = Math.max(1, Math.min(320, width - spacing.section * 2, height * 1.65));

  useEffect(() => {
    if (!preferenceReady) return undefined;
    if (started.current) {
      if (reduceMotion) { sweep.stopAnimation(); sweep.setValue(1); setFinished(true); }
      return undefined;
    }
    started.current = true;
    // A legacy native bridge may initially report null; that is unknown, not
    // background. The eventual pulse still requires a confirmed active state.
    const initialState = AppState.currentState;
    if (reduceMotion || initialState === 'background' || initialState === 'inactive') { sweep.setValue(1); setFinished(true); return undefined; }
    let mounted = true;
    let running = true;
    let pulse;
    if (Platform.OS !== 'web') {
      pulse = setTimeout(() => {
        if (mounted && running && !pulsed.current && AppState.currentState === 'active') {
          pulsed.current = true;
          try {
            if (Platform.OS === 'android') Vibration.vibrate(180);
            else void Promise.resolve(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)).catch(() => {});
          } catch (_) {}
        }
      }, READ_TIME + SWEEP_TIME / 2);
    }
    const animation = Animated.sequence([
      Animated.delay(READ_TIME),
      Animated.timing(sweep, { toValue: 1, duration: SWEEP_TIME, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false }),
    ]);
    animation.start(({ finished: didFinish }) => {
      if (mounted && running && didFinish) { running = false; clearTimeout(pulse); setFinished(true); }
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' || !running) return;
      running = false;
      clearTimeout(pulse);
      if (Platform.OS === 'android') Vibration.cancel();
      animation.stop();
      sweep.setValue(1);
      // Resume to the app, never restart the intro after returning to foreground.
      if (mounted) setFinished(true);
    });
    return () => { mounted = false; running = false; clearTimeout(pulse); if (Platform.OS === 'android') Vibration.cancel(); subscription?.remove?.(); animation.stop(); };
  }, [preferenceReady, reduceMotion, sweep]);

  useEffect(() => {
    if (!ready || !finished || completed.current) return undefined;
    let active = true;
    const animation = Animated.timing(opacity, { toValue: 0, duration: reduceMotion ? 0 : EXIT_TIME, useNativeDriver: true });
    animation.start(({ finished: didFinish }) => {
      if (active && didFinish && !completed.current) { completed.current = true; callback.current?.(); }
    });
    return () => { active = false; animation.stop(); };
  }, [ready, finished, reduceMotion, opacity]);

  const revealNative = () => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    try { void Promise.resolve(SplashScreen.hideAsync()).catch(() => {}); } catch (_) {}
  };

  return (
    <Animated.View onLayout={revealNative} style={[styles.overlay, { opacity }]} accessibilityViewIsModal importantForAccessibility="yes">
      {!reduceMotion && <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.band, {
        left: (width - beamWidth) / 2,
        top: (height - beamHeight) / 2,
        width: beamWidth,
        height: beamHeight,
        opacity: sweep.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-travel, travel] }) }, { rotate: `${BEAM_ANGLE}deg` }],
      }]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(148,166,190,0.04)', 'rgba(220,230,243,0.18)', 'rgba(255,255,255,0.42)', 'rgba(202,216,235,0.17)', 'rgba(255,255,255,0)']} locations={[0, 0.16, 0.37, 0.5, 0.68, 1]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      </Animated.View>}
      <View style={styles.brand}>
        <BrandLogo variant="full" tone="light" width={logoWidth} accessibilityLabel="SBL · Украшения и кофе" />
      </View>
      {finished && !ready && <Text style={styles.loading} accessibilityLiveRegion="polite">Подготавливаем приложение…</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.launchBackground, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 1000, elevation: 100 },
  brand: { alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute' },
  loading: { position: 'absolute', bottom: 60, color: colors.textOnDarkSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
});
