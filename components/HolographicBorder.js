import React from 'react';
import { View, StyleSheet } from 'react-native';
import HolographicSurface from './HolographicSurface';

export default function HolographicBorder({
  borderRadius = 24,
  borderWidth = 1.5,
  intensity = 0.72,
  animated = true,
  style,
  children,
}) {
  return (
    <HolographicSurface
      variant="panel"
      intensity={intensity}
      animated={animated}
      borderRadius={borderRadius}
      style={[styles.outer, { padding: borderWidth }, style]}
    >
      <View style={[styles.inner, { borderRadius: Math.max(0, borderRadius - borderWidth) }]}>
        {children}
      </View>
    </HolographicSurface>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
