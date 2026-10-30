import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Approved option В, "Янтарное стекло". Use the exact preview artwork;
// framing the existing alpha source preserves its shape and material on every OS.
const SOURCE = { width: 1330, height: 1182 };
const FRAME = { x: 174, y: 585, width: 445, height: 562 };
export default function FlameIcon({ size = 24, style }) {
  const height = Number.isFinite(size) && size > 0 ? size : 24;
  const scale = height / FRAME.height;
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.wrap, { width: height, height }, style]}>
      <View pointerEvents="none" style={{ width: FRAME.width * scale, height, overflow: 'hidden' }}>
        <Image accessible={false} source={require('../assets/brand/flame-amber-source.png')} resizeMode="stretch" style={{ position: 'absolute', width: SOURCE.width * scale, height: SOURCE.height * scale, left: -FRAME.x * scale, top: -FRAME.y * scale }} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
