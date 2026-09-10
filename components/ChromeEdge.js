// components/ChromeEdge.js
// Тонкий хромированный край (1-2px) для избранных премиальных карточек:
// профиль, награда, "украшение дня", special offer. НЕ использовать повсеместно.
import React from 'react';
import { View } from 'react-native';
import HolographicSurface from './HolographicSurface';
import { colors } from '../theme/tokens';

export default function ChromeEdge({ children, borderRadius = 22, edgeWidth = 1.5, style }) {
  return (
    <View style={[{ borderRadius }, style]}>
      <HolographicSurface
        variant="panel"
        intensity={0.4}
        animated={false}
        borderRadius={borderRadius}
        style={{ padding: edgeWidth }}
      >
        <View style={{ borderRadius: borderRadius - edgeWidth, overflow: 'hidden', backgroundColor: colors.surface3 }}>
          {children}
        </View>
      </HolographicSurface>
    </View>
  );
}
