// components/bonus/BonusRedeemCartCard.js
// Карточка списания бонусов в корзине — визуально зеркалит
// components/loyalty/LoyaltyRewardCartCard.js (тот же паттерн: иконка +
// заголовок/подзаголовок + pill-кнопка с инвертированным "applied"-состоянием),
// чтобы в корзине оба варианта "применить доступную выгоду" выглядели одной
// системой, а не двумя случайными виджетами. Проверка лимита/баланса —
// lib/bonusConfig.js, здесь только отображение.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/tokens';
import { formatPrice } from '../../data/products';

export default function BonusRedeemCartCard({ maxRedeemable, applied, onToggle }) {
  if (!maxRedeemable || maxRedeemable <= 0) return null;

  return (
    <View style={[styles.wrap, applied && styles.wrapApplied]}>
      <View style={styles.iconBox}>
        <Ionicons name="star-outline" size={20} color={applied ? '#fff' : colors.accent} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md, marginRight: spacing.md }}>
        <Text style={[styles.title, applied && styles.titleApplied]}>Оплата бонусами</Text>
        <Text style={[styles.subtitle, applied && styles.subtitleApplied]}>
          {applied
            ? `−${formatPrice(maxRedeemable)} с заказа`
            : `До ${formatPrice(maxRedeemable)} · максимум 50% заказа`}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onToggle}
        style={[styles.applyButton, applied && styles.applyButtonActive]}
        accessibilityRole="button"
        accessibilityLabel={applied ? 'Отменить оплату бонусами' : 'Оплатить бонусами'}
      >
        <Text style={[styles.applyText, applied && styles.applyTextActive]}>{applied ? 'Списано' : 'Списать'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  wrapApplied: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  iconBox: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1,
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  titleApplied: { color: '#fff' },
  subtitle: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  subtitleApplied: { color: 'rgba(255,255,255,0.7)' },
  applyButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  applyButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  applyText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  applyTextActive: { color: '#fff' },
});
