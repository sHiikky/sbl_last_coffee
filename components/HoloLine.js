import React from 'react';
import { View } from 'react-native';
import HolographicSurface from './HolographicSurface';

export default function HoloLine({ height = 5, marginHorizontal = 20, intensity = 1.35, style }) {
  return (
    <View style={[{ marginHorizontal, height, borderRadius: height / 2 }, style]}>
      <HolographicSurface
        variant="line"
        intensity={intensity}
        animated
        direction="horizontal"
        borderRadius={height / 2}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}
