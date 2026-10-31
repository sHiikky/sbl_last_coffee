// screens/LoginScreen.js
// Real Supabase OTP only. Sending remains disabled until its provider is configured.
import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import TextInput from '../components/AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import PrimaryButton from '../components/PrimaryButton';
import BrandLogo from '../components/BrandLogo';
import AccountDocumentsScreen from './AccountDocumentsScreen';
import { PHONE_AUTH_ENABLED, ADMIN_LOGIN_ENABLED, OTP_LENGTH, startPhoneSignIn, resendPhoneSignIn, verifyPhoneSignIn, adminSignIn, describeAuthError } from '../lib/accountService';
import { colors, spacing, radius, getHorizontalPadding } from '../theme/tokens';

const CODE_LENGTH = OTP_LENGTH;
// Режим администратора (без СМС): любой номер, любой код. Только если СМС-вход выключен.
const ADMIN_MODE = ADMIN_LOGIN_ENABLED && !PHONE_AUTH_ENABLED;
const AUTH_AVAILABLE = PHONE_AUTH_ENABLED || ADMIN_MODE;

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
  const raw = String(digits || '').replace(/\D/g, '');
  const d = raw.length === 11 && /^[78]/.test(raw) ? raw.slice(1) : raw;
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
  const [retryAt, setRetryAt] = useState(0);
  const [challenge, setChallenge] = useState(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const codeInputRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  const phoneValid = digits.length === 10;
  const destination = formatPhone(digits);

  useEffect(() => {
    const refresh = () => setSecondsLeft(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (step !== 'code') return undefined;
    const timer = setTimeout(() => codeInputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [step]);

  const submitPhone = async () => {
    if (!phoneValid || busyRef.current || !AUTH_AVAILABLE) return;
    if (ADMIN_MODE) { setError(''); setChallenge({ admin: true, phone: digits }); setCode(''); setStep('code'); return; }
    busyRef.current = true;
    setError('');
    setLoading(true);
    try {
      const next = await startPhoneSignIn(digits);
      if (!mountedRef.current) return;
      setChallenge(next);
      setCode('');
      setStep('code');
      setRetryAt(next.retryAt);
    } catch (cause) {
      if (mountedRef.current) { setError(describeAuthError(cause)); if (cause.retryAt) setRetryAt(cause.retryAt); }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const submitCode = async () => {
    if (busyRef.current || !challenge || (challenge.admin ? code.length < 1 : code.length !== CODE_LENGTH)) return;
    busyRef.current = true;
    setError('');
    setLoading(true);
    try {
      const account = challenge.admin ? await adminSignIn(challenge.phone) : await verifyPhoneSignIn({ ...challenge, token: code });
      await onLogin?.(account);
      if (!mountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (cause) {
      if (mountedRef.current) setError(describeAuthError(cause));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const onCodeChange = (text) => {
    const next = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(next);
    setError('');
  };

  const resend = async () => {
    if (secondsLeft > 0 || busyRef.current || !challenge || challenge.admin) return;
    busyRef.current = true;
    setLoading(true);
    setError('');
    try {
      const next = await resendPhoneSignIn(challenge);
      if (!mountedRef.current) return;
      setChallenge(next);
      setRetryAt(next.retryAt);
      setCode('');
    } catch (cause) {
      if (mountedRef.current) { setError(describeAuthError(cause)); if (cause.retryAt) setRetryAt(cause.retryAt); }
    } finally { busyRef.current = false; if (mountedRef.current) setLoading(false); }
  };

  const backFromCode = () => {
    setStep('phone');
    setCode('');
    setChallenge(null);
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
          disabled={loading}
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
        <BrandLogo variant="full" width={216} style={styles.logo} accessibilityLabel="SBL · Украшения и кофе" />

        {step === 'phone' ? (
          <>
            <Text style={styles.title}>Вход или регистрация</Text>
            <Text style={styles.subtitle}>
              Войдите по подтверждённому номеру, чтобы сохранять бонусы и историю заказов между устройствами.
            </Text>

            {ADMIN_MODE && <View style={styles.testHint}><Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} /><Text style={styles.testHintText}>Режим администратора: подойдёт любой номер и любой код, СМС не отправляется.</Text></View>}
            {!AUTH_AVAILABLE && <View style={styles.testHint}><Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} /><Text style={styles.testHintText}>Отправка СМС пока не подключена. Вход станет доступен после настройки сервиса. Меню можно посмотреть без входа.</Text></View>}

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
                disabled={!phoneValid || !AUTH_AVAILABLE || secondsLeft > 0}
                loading={loading}
                fullWidth
              />
            </View>

            {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
            {secondsLeft > 0 && <Text style={styles.legal}>Повторный запрос кода через {secondsLeft} с</Text>}
            <TouchableOpacity onPress={() => setDocumentsOpen(true)} accessibilityRole="button" accessibilityLabel="Условия предзаказа и сведения о данных" style={styles.resend}>
              <Text style={styles.resendText}>Условия предзаказа и сведения о данных</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Введите код</Text>
            <Text style={styles.subtitle}>
              {challenge?.admin ? `Режим администратора: введите любой код для ${destination}` : `Мы отправили код на ${destination}`}
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
              editable={!loading}
              style={styles.hiddenInput}
              accessibilityLabel="Код подтверждения"
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={{ marginTop: spacing.xl }}><PrimaryButton label="Подтвердить код" onPress={submitCode} loading={loading} disabled={challenge?.admin ? code.length < 1 : code.length !== CODE_LENGTH} fullWidth /></View>

            {!challenge?.admin && <TouchableOpacity
              onPress={resend}
              disabled={secondsLeft > 0 || loading}
              style={styles.resend}
              accessibilityRole="button"
              accessibilityLabel="Отправить код ещё раз"
            >
              <Text style={[styles.resendText, secondsLeft > 0 && { color: colors.textMuted }]}>
                {secondsLeft > 0 ? `Отправить код ещё раз через ${secondsLeft} с` : 'Отправить код ещё раз'}
              </Text>
            </TouchableOpacity>}

            {challenge?.mode === 'sms' && <Text style={styles.legal}>Этот номер уже зарегистрирован. После подтверждения откроется его аккаунт; гостевые заказы автоматически в него не переносятся.</Text>}
          </>
        )}
      </ScrollView>
      <AccountDocumentsScreen visible={documentsOpen} onClose={() => setDocumentsOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  logo: { marginTop: spacing.lg, marginBottom: spacing.xxl },
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
