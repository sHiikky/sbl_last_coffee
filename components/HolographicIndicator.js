import React from 'react';
import HolographicSurface from './HolographicSurface';

export default function HolographicIndicator({ width = 22, height = 3, style }) {
  return (
    <HolographicSurface
      variant="segment"
      intensity={1.18}
      animated
      borderRadius={height / 2}
      style={[{ width, height }, style]}
    />
  );
}
