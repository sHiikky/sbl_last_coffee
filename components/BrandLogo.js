import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

// Both versions use the same restored artwork. The small frame hides only the
// tagline; it never substitutes a separately generated squirrel or lettering.
const ART = { width: 1774, height: 887 };
const FRAMES = {
  mark: { x: 113, y: 191, width: 1554, height: 452 },
  full: { x: 113, y: 191, width: 1554, height: 594 },
};
export default function BrandLogo({ width = 88, tone = 'dark', variant = 'mark', style, accessibilityLabel = 'SBL' }) {
  const frame = FRAMES[variant] || FRAMES.mark;
  const scale = width / frame.width;
  return <View accessible={!!accessibilityLabel} accessibilityRole="image" accessibilityLabel={accessibilityLabel || undefined} style={[styles.frame, { width, height: frame.height * scale }, style]}>
    <Image accessible={false} source={require('../assets/brand/sbl-restored-full.png')} resizeMode="stretch" style={{ position: 'absolute', width: ART.width * scale, height: ART.height * scale, left: -frame.x * scale, top: -frame.y * scale, tintColor: tone === 'light' ? colors.textOnDark : colors.textPrimary }} />
  </View>;
}
const styles = StyleSheet.create({ frame: { overflow: 'hidden', flexShrink: 0 } });
