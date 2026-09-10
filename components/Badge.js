// components/Badge.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme/tokens';

const MAP = {
  hit: { label: 'Хит', bg: colors.accent },
  new: { label: 'Новинка', bg: colors.textPrimary },
};

export default function Badge({ type }) {
  const cfg = MAP[type];
  if (!cfg) return null;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={styles.text}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.small - 3,
  },
  text: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
