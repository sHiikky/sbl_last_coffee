// components/Chip.js
// Единый пилюля-переключатель для всех наборов опций (размер/молоко/
// температура/добавки в ProductScreen, точка/время самовывоза в CartScreen,
// категории в MenuScreen).
//
// Варианты (variant):
// - 'dark' (по умолчанию) — обычный переключатель (опции товара, точка/время
//   самовывоза в корзине, под-категории в меню). Активный — тёмная заливка.
// - 'accent' — мягкий оранжевый фон в неактивном состоянии, насыщенный
//   оранжевый в активном. Оставлен для обратной совместимости.
// - 'main' — верхний уровень навигации по всему меню (Все/Напитки/Еда/
//   Десерты): неактивный — светлый нейтральный фон, тёмный текст; активный —
//   насыщенный оранжевый акцент SBL, белый текст.
//
// small — уменьшенный размер (под-категории внутри секции).
//
// Переключение active/inactive анимировано (фон + едва заметный scale) —
// раньше состояние менялось мгновенным "скачком" цвета, что на верхних
// категориях при scroll-spy ощущалось как грубый tab-switch, а не premium
// плавный переход.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import Text from './AppText';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../theme/tokens';

const PALETTES = {
  dark: { from: colors.surfaceElevated, to: colors.textPrimary, borderFrom: colors.border, borderTo: colors.textPrimary },
  accent: { from: colors.accentSoft, to: colors.accent, borderFrom: 'transparent', borderTo: colors.accent },
  main: { from: colors.surface2, to: colors.accent, borderFrom: colors.border, borderTo: colors.accent },
};

export default function Chip({ label, subLabel, active, onPress, flex, style, accessibilityLabel, variant = 'dark', small = false }) {
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };

  const isAccent = variant === 'accent';
  const isMain = variant === 'main';
  const palette = PALETTES[variant] || PALETTES.dark;

  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const animatedBackgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [palette.from, palette.to] });
  const animatedBorderColor = progress.interpolate({ inputRange: [0, 1], outputRange: [palette.borderFrom, palette.borderTo] });
  // Едва заметный "поп" при активации — не более пары процентов размера,
  // ровно настолько, чтобы переход чувствовался живым, а не рывком.
  const animatedScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={flex && { flex: 1 }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={accessibilityLabel || label}
      activeOpacity={0.82}
    >
      <Animated.View
        style={[
          styles.chip,
          small && styles.chipSmall,
          flex && { flex: 1 },
          // Категории меню (main) — плоские «пилюли» без тени: ни у выбранной, ни у остальных.
          !active && !isMain && shadow.level1,
          active && !isMain && (isAccent ? shadow.button : shadow.level2),
          {
            backgroundColor: animatedBackgroundColor,
            borderColor: animatedBorderColor,
            transform: [{ scale: animatedScale }],
          },
          style,
        ]}
      >
        <Text
          style={[
            styles.label,
            small && styles.labelSmall,
            isAccent && !active && styles.labelAccent,
            active && styles.labelActiveOnDark,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {!!subLabel && (
          <Text style={[styles.subLabel, active && styles.subLabelActive]} numberOfLines={1}>{subLabel}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 42,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chipSmall: {
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  labelSmall: { fontSize: 12, fontWeight: '500' },
  labelAccent: { color: colors.accent },
  // Все варианты активного состояния (dark/accent/main) в этом приложении
  // заканчиваются тёмным или оранжевым фоном — в обоих случаях текст белый.
  labelActiveOnDark: { color: '#fff' },
  subLabel: { fontSize: 11, color: colors.textMuted },
  subLabelActive: { color: 'rgba(255,255,255,0.72)' },
});
