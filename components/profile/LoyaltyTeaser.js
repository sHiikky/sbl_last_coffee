// components/profile/LoyaltyTeaser.js
// Компактный светлый блок-переход в программу лояльности: только следующий шаг,
// без повторения крупного значения "N из M" (оно уже показано в чёрной карточке).
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import HolographicSurface from '../HolographicSurface';
import FlameIcon from '../FlameIcon';
import { colors, spacing, radius } from '../../theme/tokens';
import { pluralDays } from '../../loyalty/loyaltyText';

export default function LoyaltyTeaser({ currentStreak = 0, remaining = 1, onPress }) {
  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress?.();
  };

  const title = currentStreak > 0 ? `${currentStreak} ${pluralDays(currentStreak)} подряд` : 'Серия SBL';
  const subtitle = currentStreak <= 0
    ? 'Начните маршрут первой покупкой'
    : remaining <= 0
      ? 'Награда доступна — заберите её'
      : `ещё ${remaining} ${pluralDays(remaining)} до напитка в подарок`;

  return (
    <TouchableOpacity style={styles.wrap} onPress={handlePress} accessibilityRole="button" accessibilityLabel="Открыть серию SBL">
      <HolographicSurface variant="panel" intensity={0.16} animated={false} borderRadius={radius.large} style={StyleSheet.absoluteFill} />

      <View style={styles.iconBox}>
        <FlameIcon size={30} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 84,
    borderRadius: radius.large,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.07)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1,
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
});
