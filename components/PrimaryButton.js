// components/PrimaryButton.js
import React, { useRef } from 'react';
import { Pressable, Text, Animated, StyleSheet, ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, typography } from '../theme/tokens';
import HolographicSurface from './HolographicSurface';

export default function PrimaryButton({ label, onPress, fullWidth = false, disabled = false, loading = false, haptic = 'none', variant = 'accent' }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isHolo = variant === 'holo';
  const isSilver = variant === 'silver';

  const pressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 12 }).start();

  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (haptic === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPress && onPress();
  };

  return (
    <Animated.View style={[fullWidth && { width: '100%' }, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={handlePress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        style={[
          styles.button,
          isHolo && styles.holoButton,
          isSilver && styles.silverButton,
          disabled && { backgroundColor: colors.disabled, shadowOpacity: 0 },
          !disabled && shadow.button,
        ]}
      >
        {isHolo && !disabled && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <HolographicSurface
              variant="line"
              intensity={1.5}
              animated
              borderRadius={radius.medium}
              style={{ width: '100%', height: '100%' }}
            />
            <View style={styles.holoOverlay} />
          </View>
        )}

        {isSilver && !disabled && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <HolographicSurface
              variant="line"
              intensity={1.3}
              animated
              borderRadius={radius.medium}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        )}

        {loading
          ? <ActivityIndicator color={isSilver ? colors.textPrimary : '#fff'} />
          : <Text style={[typography.cardTitle, styles.label, isHolo && styles.holoLabel, isSilver && styles.silverLabel]}>{label}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.medium,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    overflow: 'hidden',
  },
  holoButton: {
    backgroundColor: '#111111',
  },
  holoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(232,80,10,0.08)',
  },
  silverButton: {
    backgroundColor: '#E5E7EB',
  },
  label: {
    color: '#fff',
    fontWeight: '700',
  },
  holoLabel: {
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  silverLabel: {
    color: '#1A1A1A',
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
