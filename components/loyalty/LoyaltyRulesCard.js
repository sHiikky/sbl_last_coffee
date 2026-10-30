// components/loyalty/LoyaltyRulesCard.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import FlameIcon from '../FlameIcon';
import { colors, spacing, radius } from '../../theme/tokens';
import { LOYALTY_CONFIG } from '../../loyalty/loyaltyConfig';

const RULES = [
  { icon: 'cafe-outline', text: 'Выданный заказ = отметка за день. Несколько заказов в день дают одну отметку' },
  { icon: 'flame-outline', text: 'Не пропускай дни, чтобы сохранить серию' },
  { icon: 'gift-outline', text: `Каждые ${LOYALTY_CONFIG.cycleLength} дней подряд — десерт в подарок. Серия продолжается без ограничения` },
  { icon: 'time-outline', text: 'День считается по времени Томска. Подарок действует 30 суток' },
];

export default function LoyaltyRulesCard() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Правила</Text>
      {RULES.map(rule => (
        <View key={rule.text} style={styles.row}>
          <View style={styles.iconBox}>
            {rule.icon === 'flame-outline' ? <FlameIcon size={22} /> : <Ionicons name={rule.icon} size={16} color={colors.textPrimary} />}
          </View>
          <Text style={styles.text}>{rule.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  iconBox: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1,
    borderWidth: 1, borderColor: colors.border,
    marginRight: spacing.md,
  },
  text: { flex: 1, fontSize: 13, color: colors.textSecondary },
});
