// screens/LoginScreen.js
// ТЕСТОВЫЙ вход по номеру телефона: два шага (номер → код из СМС). Реальной
// отправки СМС и серверной проверки нет — принимается любой код.
// Аккаунт хранится локально (App.js, ключ sbl_account); Supabase-сессию экран
// не трогает. Когда появится настоящий вход, меняется только submitPhone/submitCode.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Image, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import PrimaryButton from '../components/PrimaryButton';
import { colors, spacing, radius, getHorizontalPadding } from '../theme/tokens';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

// Из введённого текста достаёт до 10 цифр номера после +7.
// `prevDigits` нужен для Backspace: он может удалить только скобку/пробел
// из маски, тогда цифры не изменились — убираем последнюю вручную.
function parsePhoneInput(text, prevDigits) {
  const all = text.replace(/\D/g, '');
  let digits;
  if (text.startsWith('+7')) digits = all.slice(1);          // обычный ввод по маске
  else if (all.length === 11 && /^[78]/.test(all)) digits = all.slice(1); // вставка 8900… / 7900…
  else digits = all;
  digits = digits.slice(0, 10);
  if (digits === prevDigits && text.length < formatPhone(prevDigits).length) {
    digits = prevDigits.slice(0, -1);
  }
  return digits;
}

export function formatPhone(digits) {
  const d = digits || '';
  let out = '+7';
  if (d.length > 0) out += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

export default function LoginScreen({ navigation, onLogin }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);

  const [step, setStep] = useState('phone'); // 'phone' (ввод номера или почты) | 'code'
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInputRef = useRef(null);

  const phoneValid = digits.length === 10;
  const destination = formatPhone(digits);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  useEffect(() => {
    if (step === 'code') setTimeout(() => codeInputRef.current?.focus(), 150);
  }, [step]);

  const submitPhone = () => {
    if (!phoneValid || loading) return;
    setError('');
    setLoading(true);
    // Имитация отправки СМС.
    setTimeout(() => {
      setLoading(false);
      setCode('');
      setStep('code');
      setSecondsLeft(RESEND_SECONDS);
    }, 600);
  };

  const submitCode = () => {
    if (loading) return;
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onLogin?.({ phone: digits });
      navigation.goBack();
    }, 500);
  };

  const onCodeChange = (text) => {
    const next = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(next);
    setError('');
    if (next.length === CODE_LENGTH) submitCode();
  };

  const resend = () => {
    if (secondsLeft > 0) return;
    setCode('');
    setError('');
    setSecondsLeft(RESEND_SECONDS);
  };

  const backFromCode = () => {
    setStep('phone');
    setCode('');
    setError('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top, paddingHorizontal: hPad }}>
        <TouchableOpacity
          onPress={step === 'code' ? backFromCode : () => navigation.goBack()}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Ionicons name={step === 'code' ? 'arrow-back' : 'close'} size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image source={require('../assets/logo-mark.png')} style={styles.logo} resizeMode="contain" />

        {step === 'phone' ? (
          <>
            <Text style={styles.title}>Вход или регистрация</Text>
            <Text style={styles.subtitle}>
              Введите номер телефона, мы отправим код подтверждения. Так бонусы и история заказов сохранятся за вами.
            </Text>

            <Text style={styles.label}>Номер телефона</Text>
            <View style={[styles.field, error ? styles.fieldError : null]}>
              <TextInput
                value={formatPhone(digits)}
                onChangeText={(t) => { setDigits(parsePhoneInput(t, digits)); setError(''); }}
                placeholder="+7 (900) 000-00-00"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                inputMode="tel"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={18}
                style={styles.input}
                onSubmitEditing={submitPhone}
                returnKeyType="done"
                accessibilityLabel="Номер телефона"
              />
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <PrimaryButton
                label="Получить код"
                onPress={submitPhone}
                disabled={!phoneValid}
                loading={loading}
                fullWidth
              />
            </View>

            <Text style={styles.legal}>
              Нажимая «Получить код», вы соглашаетесь с условиями использования и политикой конфиденциальности.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Введите код</Text>
            <Text style={styles.subtitle}>
              Мы отправили код на {destination}
            </Text>

            <TouchableOpacity activeOpacity={1} onPress={() => codeInputRef.current?.focus()} style={styles.codeRow}>
              {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                const active = i === code.length && !loading;
                return (
                  <View
                    key={i}
                    style={[styles.codeBox, active && styles.codeBoxActive, error ? styles.fieldError : null]}
                  >
                    <Text style={styles.codeDigit}>{code[i] || ''}</Text>
                  </View>
                );
              })}
            </TouchableOpacity>
            {/* Скрытый настоящий инпут: ловит ввод и автозаполнение кода из СМС. */}
            <TextInput
              ref={codeInputRef}
              value={code}
              onChangeText={onCodeChange}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              style={styles.hiddenInput}
              accessibilityLabel="Код подтверждения"
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              onPress={resend}
              disabled={secondsLeft > 0}
              style={styles.resend}
              accessibilityRole="button"
              accessibilityLabel="Отправить код ещё раз"
            >
              <Text style={[styles.resendText, secondsLeft > 0 && { color: colors.textMuted }]}>
                {secondsLeft > 0 ? `Отправить код ещё раз через ${secondsLeft} с` : 'Отправить код ещё раз'}
              </Text>
            </TouchableOpacity>

            <View style={styles.testHint}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.testHintText}>Тестовый режим: код не отправляется, подойдут любые {CODE_LENGTH} цифры</Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  logo: { width: 88, height: 42, marginTop: spacing.lg, marginBottom: spacing.xxl },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xxl },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  field: {
    minHeight: 56,
    borderRadius: radius.medium,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fieldError: { borderColor: colors.danger },
  input: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, paddingVertical: 14 },
  legal: { fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', columnGap: spacing.md },
  codeBox: {
    flex: 1,
    height: 64,
    borderRadius: radius.medium,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: colors.accent, borderWidth: 2 },
  codeDigit: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorText: { fontSize: 13, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  resend: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  resendText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  testHint: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.surface0,
  },
  testHintText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
});
