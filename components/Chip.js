// components/Chip.js
// Единый пилюля-переключатель для всех наборов опций (размер/молоко/
// температура/добавки в ProductScreen, точка/время самовывоза в CartScreen,
// категории в MenuScreen). Раньше в разных экранах было три чуть разных
// стиля active-состояния (просто жирная обводка, просто цвет текста) —
// теперь везде один: активный чип заливается тёмным, плюс лёгкая тень для
// объёма вместо плоской заливки.
//
// Варианты (variant):
// - 'dark' (по умолчанию) — обычный переключатель (опции товара, точка/время
//   самовывоза в корзине, под-категории в меню). Активный — тёмная заливка.
// - 'accent' — мягкий оранжевый фон в неактивном состоянии, насыщенный
//   оранжевый в активном. Сейчас нигде в меню не используется, оставлен для
//   обратной совместимости и будущих экранов.
// - 'main' — верхний уровень навигации по всему меню (Все/Напитки/Еда/
//   Десерты): неактивный — светлый нейтральный фон, тёмный текст; активный —
//   насыщенный оранжевый акцент SBL, белый текст. В отличие от 'accent' здесь
//   неактивное состояние нейтральное, а не оранжевое — так по спецификации
//   иерархия "главные категории → под-категории" читается яснее.
//
// small — уменьшенный размер (под-категории внутри секции должны выглядеть
// заметно менее выразительными, чем главные категории наверху).
import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../theme/tokens';

export default function Chip({ label, subLabel, active, onPress, flex, style, accessibilityLabel, variant = 'dark', small = false }) {
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };

  const isAccent = variant === 'accent';
  const isMain = variant === 'main';

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        styles.chip,
        small && styles.chipSmall,
        flex && { flex: 1 },
        isAccent && styles.chipAccent,
        isMain && styles.chipMain,
        active && (isAccent ? styles.chipAccentActive : isMain ? styles.chipMainActive : styles.chipActive),
        !active && shadow.level1,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={accessibilityLabel || label}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.label,
          small && styles.labelSmall,
          isAccent && styles.labelAccent,
          active && (isAccent ? styles.labelAccentActive : isMain ? styles.labelMainActive : styles.labelActive),
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {!!subLabel && (
        <Text style={[styles.subLabel, active && styles.subLabelActive]} numberOfLines={1}>{subLabel}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chipSmall: {
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  chipActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    ...shadow.level2,
  },
  chipAccent: {
    backgroundColor: colors.accentSoft,
    borderColor: 'transparent',
  },
  chipAccentActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadow.button,
  },
  chipMain: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
  },
  chipMainActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadow.button,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  labelSmall: { fontSize: 12, fontWeight: '500' },
  labelActive: { color: '#fff' },
  labelAccent: { color: colors.accent },
  labelAccentActive: { color: '#fff' },
  labelMainActive: { color: '#fff' },
  subLabel: { fontSize: 11, color: colors.textMuted },
  subLabelActive: { color: 'rgba(255,255,255,0.72)' },
});
