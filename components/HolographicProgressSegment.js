import React from 'react';
import { View } from 'react-native';
import HolographicSurface from './HolographicSurface';
import { colors } from '../theme/tokens';

export default function HolographicProgressSegment({ filled = false, height = 9, animated = true }) {
  const radius = height / 2;

  if (!filled) {
    return (
      <View
        style={{
          width: '100%',
          height,
          borderRadius: radius,
          backgroundColor: colors.skeleton,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
        }}
      />
    );
  }

  return (
    <HolographicSurface
      variant="segment"
      intensity={1.12}
      animated={animated}
      borderRadius={radius}
      style={{ width: '100%', height }}
    />
  );
}
