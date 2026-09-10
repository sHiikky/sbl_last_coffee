// components/HoloRing.js
// Голографическое кольцо для аватара — серебро + радуга + статичный блик
// (анимация на маленьком элементе не считывается, поэтому здесь animated=false).
import React from 'react';
import { View } from 'react-native';
import HolographicSurface from './HolographicSurface';

export default function HoloRing({ size = 44, innerColor = '#0C0C0C', children, animated = false }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }}>
      <HolographicSurface
        variant="ring"
        intensity={0.5}
        animated={animated}
        borderRadius={size / 2}
        style={{ width: size, height: size }}
      />
      <View
        style={{
          position: 'absolute',
          top: 2.5, left: 2.5,
          width: size - 5,
          height: size - 5,
          borderRadius: (size - 5) / 2,
          backgroundColor: innerColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}
