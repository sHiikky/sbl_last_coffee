// components/loyalty/LoyaltyHomeWidget.js
// Карточка серии на Главной — отдельно от HomeLoyaltyCard (баллы/кэшбек,
// другая механика, см. ТЗ п.47). Светлая карточка в стиле остальных
// белых карточек SBL: borderRadius ~24, мягкая тень, padding 20/18.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import * as Haptics from 'expo-haptics';
import LoyaltyPath from './LoyaltyPath';
import FlameIcon from '../FlameIcon';
import { colors, spacing, radius, shadow } from '../../theme/tokens';
import { getCurrentLoyaltyPath, getDaysUntilNextMilestone } from '../../loyalty/loyaltySelectors';
import { LOYALTY_CONFIG } from '../../loyalty/loyaltyConfig';
import { pluralDays } from '../../loyalty/loyaltyText';

function headerCopy(todayStatus, currentStreak) {
  if (todayStatus === 'new') return { left: 'Серия ещё не началась', right: null };
  const left = `${currentStreak} ${pluralDays(currentStreak)} подряд`;
  return { left };
}

function statusHint(todayStatus) {
  switch (todayStatus) {
    case 'completed': return 'Сегодня засчитано ✓';
    case 'pending': return 'Зайди сегодня, чтобы сохранить серию';
    case 'broken': return 'Серия прервалась — начни новую с покупки';
    default: return 'Соверши первую покупку, чтобы начать маршрут';
  }
}

export default function LoyaltyHomeWidget({ loyaltyState, onPress }) {
  if (!loyaltyState?.ready) return null;

  const { todayStatus, currentStreak } = loyaltyState;
  const nodes = getCurrentLoyaltyPath(loyaltyState, LOYALTY_CONFIG);
  const daysUntilReward = getDaysUntilNextMilestone(loyaltyState, LOYALTY_CONFIG);
  const { left } = headerCopy(todayStatus, currentStreak);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress?.();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={[styles.wrap, shadow.card]}
      accessibilityRole="button"
      accessibilityLabel="Открыть программу лояльности SBL"
    >
      <View style={styles.headerRow}>
        <View style={styles.statusHeading}>
          <FlameIcon size={24} />
          <Text style={styles.headerLeft}>{left}</Text>
        </View>
        {daysUntilReward > 0 && todayStatus !== 'new' && (
          <Text style={styles.headerRight}>Ещё {daysUntilReward} {pluralDays(daysUntilReward)} до награды</Text>
        )}
      </View>

      <Text style={styles.hint}>{statusHint(todayStatus)}</Text>

      <View style={{ marginTop: spacing.md }}>
        <LoyaltyPath nodes={nodes} size="compact" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xlarge,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl - 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusHeading: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: spacing.sm },
  headerLeft: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  headerRight: { fontSize: 12, fontWeight: '600', color: colors.accent, flexShrink: 1, textAlign: 'right' },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
