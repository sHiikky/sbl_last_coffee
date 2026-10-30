// components/Badge.js
// Метка «Хит» / «Новинка». placement:
// - 'card' (по умолчанию) — левый верхний угол карточки товара;
// - 'hero' — крупная метка в левом нижнем углу фото на экране товара.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Text from './AppText';
import { colors } from '../theme/tokens';

const MAP = {
  hit: { label: 'Хит', bg: colors.accent },
  new: { label: 'Новинка', bg: colors.textPrimary },
};

export default function Badge({ type, placement = 'card' }) {
  const cfg = MAP[type];
  if (!cfg) return null;
  const hero = placement === 'hero';
  return (
    <View style={[styles.badge, hero ? styles.badgeHero : styles.badgeCard, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.text, hero && styles.textHero]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCard: {
    top: 8,
    left: 8,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  badgeHero: {
    left: 16,
    bottom: 16,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  text: {
    color: colors.textOnDark,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  textHero: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
