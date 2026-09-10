import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { silverBase, holoSpectrum } from '../theme/tokens';

const VARIANT_TUNING = {
  line: {
    patchWidth: 0.5,
    sweepDuration: 18000,
    iridescence: 1.55,
    sheen: 0.55,
    glare: 0.9,
    rotate: '0deg',
    specularScale: 1.24,
  },
  segment: {
    patchWidth: 0.36,
    sweepDuration: 5800,
    iridescence: 0.92,
    sheen: 0.56,
    glare: 0.46,
    rotate: '-10deg',
    specularScale: 1.08,
  },
  panel: {
    patchWidth: 0.34,
    sweepDuration: 6000,
    iridescence: 0.98,
    sheen: 0.6,
    glare: 0.5,
    rotate: '-12deg',
    specularScale: 1.12,
  },
  ring: {
    patchWidth: 0.32,
    sweepDuration: 6000,
    iridescence: 0.9,
    sheen: 0.55,
    glare: 0.44,
    rotate: '-18deg',
    specularScale: 1.06,
  },
};

export default function HolographicSurface({
  variant = 'line',
  intensity = 0.55,
  animated = true,
  borderRadius = 0,
  direction = 'diagonal',
  style,
  children,
}) {
  const motion = useRef(new Animated.Value(0)).current;
  const microShift = useRef(new Animated.Value(0)).current;
  const { width: viewportWidth } = useWindowDimensions();

  const tuning = VARIANT_TUNING[variant] || VARIANT_TUNING.panel;
  const isLine = variant === 'line';
  const patchTravel = Math.max(220, viewportWidth * (isLine ? 1.35 : 1.15));
  const patchWidth = `${Math.round(tuning.patchWidth * 100)}%`;

  useEffect(() => {
    if (!animated) return undefined;

    const mainLoop = Animated.loop(
      Animated.timing(motion, {
        toValue: 1,
        duration: tuning.sweepDuration,
        easing: isLine ? Easing.linear : Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );

    const secondaryLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(microShift, {
          toValue: 1,
          duration: tuning.sweepDuration * 0.66,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(microShift, {
          toValue: 0,
          duration: tuning.sweepDuration * 0.66,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    mainLoop.start();
    secondaryLoop.start();

    return () => {
      mainLoop.stop();
      secondaryLoop.stop();
    };
  }, [animated, microShift, motion, tuning.sweepDuration]);

  const sweepTranslateX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [patchTravel, -patchTravel],
  });

  const overlayDrift = microShift.interpolate({
    inputRange: [0, 1],
    outputRange: [18, -18],
  });

  const specularBreath = microShift.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.98, tuning.specularScale, 1],
  });

  const overlayAngle = useMemo(() => {
    if (isLine) return { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
    if (direction === 'horizontal') return { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
    return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
  }, [direction, isLine]);

  return (
    <View style={[styles.wrap, { borderRadius, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={isLine ? ['#FFFFFF', '#F4F7FF', '#E2E8F5', '#F8FBFF', '#FFFFFF'] : silverBase}
        locations={[0, 0.18, 0.45, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: isLine ? 1 : 0.92, y: isLine ? 0 : 1 }}
        style={StyleSheet.absoluteFill}
      />

        <LinearGradient
          colors={[
            'rgba(255,255,255,0.98)',
            'rgba(247,249,255,0.88)',
            'rgba(220,228,243,0.5)',
            'rgba(146,154,170,0.18)',
          ]}
          locations={[0, 0.22, 0.62, 1]}
          start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX: overlayDrift }, { scaleX: isLine ? 1.22 : 1.08 }],
          },
        ]}
      >
        <LinearGradient
          colors={isLine ? [
            'rgba(255,255,255,0)',
            'rgba(58,110,255,0.85)',
            'rgba(255,255,255,0.95)',
            'rgba(255,209,64,0.92)',
            'rgba(255,59,48,0.88)',
            'rgba(255,72,196,0.9)',
            'rgba(58,110,255,0.85)',
            'rgba(255,255,255,0)',
          ] : holoSpectrum}
          locations={isLine ? [0, 0.06, 0.2, 0.4, 0.6, 0.8, 0.94, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1]}
          start={overlayAngle.start}
          end={overlayAngle.end}
          style={[StyleSheet.absoluteFill, { opacity: Math.min(1, tuning.iridescence * intensity) }]}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX: sweepTranslateX }, { scaleX: specularBreath }],
            opacity: Math.min(0.5, tuning.iridescence * intensity * 0.72),
          },
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(58,110,255,0.38)',
            'rgba(255,255,255,0.4)',
            'rgba(255,209,64,0.34)',
            'rgba(255,59,48,0.34)',
            'rgba(255,72,196,0.34)',
            'rgba(58,110,255,0.3)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.14, 0.3, 0.46, 0.62, 0.78, 0.92, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <LinearGradient
        colors={[
          'rgba(255,255,255,0.52)',
          'rgba(255,255,255,0.18)',
          'rgba(255,255,255,0)',
          'rgba(0,0,0,0.08)',
        ]}
        locations={[0, 0.14, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: tuning.sheen }]}
        pointerEvents="none"
      />

      <LinearGradient
        colors={[
          'rgba(255,255,255,0.16)',
          'rgba(255,255,255,0.04)',
          'rgba(255,255,255,0.12)',
          'rgba(255,255,255,0)',
          'rgba(0,0,0,0.04)',
        ]}
        locations={[0, 0.2, 0.42, 0.72, 1]}
        start={{ x: 0, y: 0.18 }}
        end={{ x: 1, y: 0.82 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {animated && (
        <>
          {isLine && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.rgbWave,
                {
                  transform: [{ translateX: sweepTranslateX }, { scaleX: specularBreath }],
                },
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(58,110,255,0.3)',
                  'rgba(255,255,255,0.4)',
                  'rgba(255,209,64,0.34)',
                  'rgba(255,59,48,0.34)',
                  'rgba(255,72,196,0.36)',
                  'rgba(58,110,255,0.3)',
                  'rgba(255,255,255,0)',
                ]}
                locations={[0, 0.1, 0.24, 0.38, 0.52, 0.66, 0.8, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}

          <Animated.View
            pointerEvents="none"
            style={[
              styles.lightPatch,
              {
                width: patchWidth,
                top: isLine ? -3 : -28,
                bottom: isLine ? -3 : -28,
                transform: [{ translateX: sweepTranslateX }, { rotate: tuning.rotate }, { scaleX: specularBreath }],
              },
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(255,255,255,0)',
                'rgba(255,255,255,0.28)',
                'rgba(255,255,255,1)',
                'rgba(255,251,243,0.68)',
                'rgba(225,242,255,0.58)',
                'rgba(255,245,232,0.34)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.14, 0.34, 0.5, 0.68, 0.84, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.specularHalo,
              {
                width: patchWidth,
                transform: [{ translateX: sweepTranslateX }, { rotate: tuning.rotate }, { scaleX: specularBreath }],
                opacity: tuning.glare,
              },
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(255,255,255,0)',
                'rgba(255,255,255,0.16)',
                'rgba(250,252,255,0.48)',
                'rgba(255,255,255,0.14)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.16, 0.5, 0.82, 1]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  rgbWave: {
    ...StyleSheet.absoluteFillObject,
    top: -4,
    bottom: -4,
  },
  lightPatch: {
    position: 'absolute',
    left: '-10%',
  },
  specularHalo: {
    ...StyleSheet.absoluteFillObject,
    left: '-10%',
    top: -6,
    bottom: -6,
  },
});
