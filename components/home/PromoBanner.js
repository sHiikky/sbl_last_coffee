// components/home/PromoBanner.js
// Мини-баннер временного промо на Главной (public.promo_banners) — виден,
// пока текущее время попадает в [starts_at, ends_at] баннера (см.
// lib/promoService.js). Управление баннерами — вручную через SQL, не из
// приложения (см. CLAUDE.md).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme/tokens';

export default function PromoBanner({ promo, onPress }) {
  if (!promo) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.wrap, shadow.card]}
      accessibilityRole="button"
      accessibilityLabel={promo.title}
    >
      <View style={styles.iconBox}>
        <Ionicons name="flash-outline" size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.title} numberOfLines={1}>{promo.title}</Text>
        {promo.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{promo.subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  iconBox: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1,
  },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
