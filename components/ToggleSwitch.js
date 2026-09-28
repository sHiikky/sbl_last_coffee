// components/ToggleSwitch.js
// Переключатель 52×32 в стиле приложения: серый трек → оранжевый акцент,
// белый бегунок 26×26. Свой, а не системный Switch, чтобы на iOS, Android и
// в вебе выглядел одинаково.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/tokens';

export default function ToggleSwitch({ value, onValueChange, disabled = false, accessibilityLabel }) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [value, progress]);

  const trackColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.disabled, colors.accent] });
  const thumbX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        Haptics.selectionAsync();
        onValueChange?.(!value);
      }}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={disabled && styles.disabled}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 52, height: 32, borderRadius: 16, justifyContent: 'center', paddingHorizontal: 3 },
  thumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  disabled: { opacity: 0.5 },
});
