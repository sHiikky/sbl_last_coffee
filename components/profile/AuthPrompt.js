// components/profile/AuthPrompt.js
// Экран профиля для невошедшего пользователя: логотип SBL, заголовок с пояснением и кнопка входа по телефону.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import PrimaryButton from '../PrimaryButton';
import { colors, spacing, getHorizontalPadding } from '../../theme/tokens';

const LOGO_RATIO = 584 / 1233; // assets/logo-mark.png

export default function AuthPrompt({ width, height, onPhone }) {
  const hPad = getHorizontalPadding(width);
  const heroHeight = height * 0.42;
  const logoWidth = Math.min(width * 0.6, 260);

  return (
    <View style={{ minHeight: height }}>
      <View style={{ height: heroHeight, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.section }}>
        <Image
          source={require('../../assets/logo-mark.png')}
          style={{ width: logoWidth, height: logoWidth * LOGO_RATIO }}
          resizeMode="contain"
          accessibilityLabel="SBL"
        />
      </View>

      <View style={{ paddingHorizontal: hPad, alignItems: 'center' }}>
        <Text style={styles.title}>Войдите в аккаунт</Text>
        <Text style={styles.subtitle}>
          Оформляйте заказы быстрее, копите бонусы и отслеживайте статус заказа
        </Text>

        <View style={styles.buttons}>
          <PrimaryButton label="По номеру телефона" onPress={onPhone} fullWidth haptic="light" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 320,
  },
  buttons: { width: '100%', rowGap: spacing.md, marginTop: spacing.section },
});
