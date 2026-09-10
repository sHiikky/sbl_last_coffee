// components/PressableCard.js
// Универсальная обёртка для карточек: лёгкое проседание + усиление тени при нажатии.
import React, { useRef } from 'react';
import { Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

export default function PressableCard({ onPress, style, children, haptic = 'none', accessibilityLabel }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.timing(scale, { toValue: 0.985, duration: 100, useNativeDriver: true }).start();
  const pressOut = () => Animated.timing(scale, { toValue: 1,     duration: 140, useNativeDriver: true }).start();

  const handlePress = () => {
    if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (haptic === 'selection') Haptics.selectionAsync();
    onPress && onPress();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
