// components/loyalty/LoyaltyRewardCartCard.js
// Карточка доступной награды в корзине. Не применяет скидку автоматически —
// только по явному нажатию "Применить". Условия применимости считает
// loyalty/loyaltyService.js (isRewardApplicable/getEligibleCartItemsForReward),
// компонент только отображает результат.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/tokens';

export default function LoyaltyRewardCartCard({ reward, applicable, eligibleItem, applied, onToggle }) {
  return (
    <View style={[styles.wrap, applied && styles.wrapApplied]}>
      <View style={styles.iconBox}>
        <Ionicons name="gift-outline" size={20} color={applied ? '#fff' : colors.accent} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md, marginRight: spacing.md }}>
        <Text style={[styles.title, applied && styles.titleApplied]}>Доступна награда</Text>
        <Text style={[styles.subtitle, applied && styles.subtitleApplied]}>
          {reward.title}
          {applicable && eligibleItem ? ` · покроет «${eligibleItem.name}»` : ''}
        </Text>
        {!applicable && (
          <Text style={styles.hint}>Добавьте десерт в корзину, чтобы применить награду</Text>
        )}
      </View>

      <TouchableOpacity
        onPress={onToggle}
        disabled={!applicable}
        style={[styles.applyButton, applied && styles.applyButtonActive, !applicable && styles.applyButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={applied ? 'Отменить применение награды' : 'Применить награду'}
      >
        <Text style={[styles.applyText, applied && styles.applyTextActive]}>{applied ? 'Применена' : 'Применить'}</Text>
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
    marginBottom: spacing.lg,
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
  hint: { fontSize: 10.5, color: colors.textMuted, marginTop: 2 },
  applyButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  applyButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  applyButtonDisabled: { opacity: 0.5 },
  applyText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  applyTextActive: { color: '#fff' },
});
