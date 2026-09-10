// components/loyalty/LoyaltyDayNode.js
// Одна точка на карте серии. Чисто презентационный компонент — весь статус
// приходит снаружи из loyalty/loyaltySelectors.js, здесь нет бизнес-правил.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';
import { LOYALTY_CONFIG } from '../../loyalty/loyaltyConfig';

const CIRCLE = { compact: 26, full: 40 };

function formatAccessibleDate(dateKey) {
  try {
    // dateKey — 'YYYY-MM-DD', парсим как UTC-полночь, чтобы не съехать на
    // соседний день из-за локальной таймзоны браузера/устройства.
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${dateKey}T00:00:00.000Z`));
  } catch {
    return dateKey;
  }
}

export default function LoyaltyDayNode({ node, size = 'full' }) {
  const circleSize = CIRCLE[size] || CIRCLE.full;

  if (node.kind === 'reward') {
    const unlocked = node.status === 'reward_available';
    return (
      <View style={styles.wrap}>
        <View
          style={[
            styles.touchTarget,
            {
              width: Math.max(44, circleSize + 8),
              height: Math.max(44, circleSize + 8),
            },
          ]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={unlocked ? 'Награда доступна' : `Награда за ${LOYALTY_CONFIG.cycleLength} дней подряд`}
        >
          <View
            style={[
              styles.circle,
              {
                width: circleSize + 8,
                height: circleSize + 8,
                borderRadius: (circleSize + 8) / 2,
                backgroundColor: unlocked ? colors.accent : colors.surfaceElevated,
                borderColor: unlocked ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons name="gift" size={circleSize * 0.46} color={unlocked ? '#fff' : colors.textMuted} />
          </View>
        </View>
      </View>
    );
  }

  const { status, dayNumber, dateKey, index } = node;
  const isCompleted = status === 'completed';
  const isPending = status === 'today_pending';
  const readableDate = formatAccessibleDate(dateKey);
  const dayOfTotal = `день ${index} из ${LOYALTY_CONFIG.cycleLength}`;

  const label = isCompleted
    ? `${readableDate}, ${dayOfTotal}, посещение выполнено`
    : isPending
      ? `${readableDate}, ${dayOfTotal}, сегодня, покупка ещё не совершена`
      : `${readableDate}, ${dayOfTotal}`;

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.touchTarget, { width: Math.max(44, circleSize), height: Math.max(44, circleSize) }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
      >
        <View
          style={[
            styles.circle,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              backgroundColor: isCompleted ? colors.accent : colors.surfaceElevated,
              borderColor: isPending ? colors.accent : isCompleted ? colors.accent : colors.border,
              borderWidth: isPending ? 2 : 1,
            },
            isPending && styles.pendingRing,
          ]}
        >
          {isCompleted ? (
            <Ionicons name="checkmark" size={circleSize * 0.5} color="#fff" />
          ) : (
            <Text style={[styles.dayText, { color: isPending ? colors.accent : colors.textMuted, fontSize: circleSize * 0.34 }]}>
              {dayNumber}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  touchTarget: { alignItems: 'center', justifyContent: 'center' },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pendingRing: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 2,
  },
  dayText: { fontWeight: '700' },
});
