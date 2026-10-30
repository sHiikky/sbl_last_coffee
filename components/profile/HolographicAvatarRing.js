// components/profile/HolographicAvatarRing.js
// Тонкое голографическое кольцо вокруг аватара профиля (серебро + едва
// уловимый цветной перелив), внутри — фото пользователя или инициалы.
import React from 'react';
import { View, Image } from 'react-native';
import Text from '../AppText';
import HolographicSurface from '../HolographicSurface';
import { darkProfile } from '../../theme/tokens';

export default function HolographicAvatarRing({ size = 78, source, initials = '', animated = true }) {
  const ringWidth = 3.5;

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }}>
      <HolographicSurface
        variant="ring"
        intensity={0.45}
        animated={animated}
        borderRadius={size / 2}
        style={{ width: size, height: size }}
      />
      <View
        style={{
          position: 'absolute',
          top: ringWidth, left: ringWidth,
          width: size - ringWidth * 2,
          height: size - ringWidth * 2,
          borderRadius: (size - ringWidth * 2) / 2,
          backgroundColor: darkProfile.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {source ? (
          <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ color: darkProfile.text, fontSize: size * 0.32, fontWeight: '700' }}>{initials}</Text>
        )}
      </View>
    </View>
  );
}
