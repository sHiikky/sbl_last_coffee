// screens/LoginScreen.js
// Real Supabase OTP only. Sending remains disabled until its provider is configured.
import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Keyboard, Platform, Linking, Animated, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import TextInput from '../components/AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import AccountProfileFields from '../components/AccountProfileFields';
import useMotionPreference from '../hooks/useMotionPreference';
import { normalizeProfileName, hasCompleteProfile, saveAccountProfile } from '../lib/accountProfile';
import { writeLocalAvatar } from '../lib/localAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import PrimaryButton from '../components/PrimaryButton';
import BrandLogo from '../components/BrandLogo';
import AccountDocumentsScreen from './AccountDocumentsScreen';
import { PHONE_AUTH_ENABLED, WAITCALL_ENABLED, ADMIN_LOGIN_ENABLED, OTP_LENGTH, startPhoneSignIn, resendPhoneSignIn, verifyPhoneSignIn, startWaitCallSignIn, checkWaitCallSignIn, adminSignIn, describeAuthError } from '../lib/accountService';
import { colors, spacing, radius, shadow, getHorizontalPadding } from '../theme/tokens';

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

export default function LoginScreen({ navigation, route, onLogin }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const callNumberFontSize = Math.min(28, Math.max(17, (Math.min(width, 528) - 2 * hPad - 2 * spacing.xl - 2 * spacing.lg) / 11.5));

  const [step, setStep] = useState('phone'); // phone | call | code
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [callLeft, setCallLeft] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [challenge, setChallenge] = useState(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [mode, setMode] = useState('login');
  const [consent, setConsent] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', avatarUri: null });
  const [pendingAccount, setPendingAccount] = useState(null);
  const profileValid = !!normalizeProfileName(profile.firstName) && !!normalizeProfileName(profile.lastName);
  const registrationNotice = mode === 'register' && error === describeAuthError({ code: 'PHONE_NOT_REGISTERED' });
  const { reduceMotion } = useMotionPreference();
  const entrance = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    entrance.stopAnimation();
    if (reduceMotion) { entrance.setValue(1); return; }
    entrance.setValue(0);
    Animated.timing(entrance, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [step, mode, reduceMotion, entrance]);
  const completeLogin = async account => {
    let updated = account;
    if (mode === 'register' && profileValid && !hasCompleteProfile(account)) updated = await saveAccountProfile(account.id, profile);
    if (mode === 'register' && profile.avatarUri) await writeLocalAvatar(account.id, profile.avatarUri);
    await onLogin?.(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (mountedRef.current) navigation.goBack();
  };
  const codeInputRef = useRef(null);
  const scrollRef = useRef(null);
  const busyRef = useRef(false);
  const callFinishedRef = useRef(false);
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
    if (step !== 'call' || !challenge?.attemptId) return undefined;
    const refresh = () => setCallLeft(Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000)));
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [step, challenge?.attemptId]);

  useEffect(() => {
    if (step !== 'call' || !challenge?.attemptId) return undefined;
    let active = true;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (!active || inFlight || callFinishedRef.current || Date.now() >= challenge.expiresAt) return;
      inFlight = true;
      try {
        const account = await checkWaitCallSignIn(challenge);
        if (active && account && mountedRef.current) {
          callFinishedRef.current = true;
          try { await completeLogin(account); } catch {
            await onLogin?.(account);
            setPendingAccount(account); setStep('profile');
            setError('Вход выполнен. Не удалось сохранить профиль — попробуйте ещё раз.');
          }
        }
      } catch (cause) {
        if (!active || !mountedRef.current) return;
        // Попытка истекла/заменена: прекращаем опрос и возвращаем к вводу номера с понятным текстом.
        if (cause?.code === 'WAITCALL_EXPIRED') { active = false; clearInterval(timer); setChallenge(null); setStep('phone'); }
        setError(describeAuthError(cause));
      }
      finally { inFlight = false; }
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [step, challenge?.attemptId]);

  useEffect(() => {
    if (step !== 'code') return undefined;
    const timer = setTimeout(() => codeInputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [step]);

  const submitPhone = async () => {
    if (!phoneValid || busyRef.current || !AUTH_AVAILABLE || secondsLeft > 0 || !consent || (mode === 'register' && !profileValid)) return;
    if (ADMIN_MODE) { setError(''); setChallenge({ admin: true, phone: digits }); setCode(''); setStep('code'); return; }
    busyRef.current = true;
    setError('');
    setLoading(true);
    try {
      const next = WAITCALL_ENABLED ? await startWaitCallSignIn(digits, { intent: mode }) : await startPhoneSignIn(digits);
      if (!mountedRef.current) return;
      setChallenge(next);
      Keyboard.dismiss();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setCode('');
      callFinishedRef.current = false;
      setStep(WAITCALL_ENABLED ? 'call' : 'code');
      if (next.expiresAt) setCallLeft(Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)));
      if (next.retryAt) setRetryAt(next.retryAt);
    } catch (cause) {
      if (mountedRef.current) {
        if (cause.code === 'PHONE_NOT_REGISTERED') { setMode('register'); Keyboard.dismiss(); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
        setError(describeAuthError(cause)); if (cause.retryAt) setRetryAt(cause.retryAt);
      }
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
      await completeLogin(account);
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
      if (mountedRef.current) {
        if (cause.code === 'PHONE_NOT_REGISTERED') { setMode('register'); Keyboard.dismiss(); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
        setError(describeAuthError(cause)); if (cause.retryAt) setRetryAt(cause.retryAt);
      }
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
      <View style={{ paddingTop: insets.top, paddingHorizontal: hPad, width: '100%', maxWidth: 528, alignSelf: 'center' }}>
        <TouchableOpacity
          onPress={step !== 'phone' ? backFromCode : () => navigation.goBack()}
          disabled={loading}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Ionicons name={step !== 'phone' ? 'arrow-back' : 'close'} size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: insets.bottom + spacing.xxl, width: '100%', maxWidth: 528, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BrandLogo variant="full" width={180} style={styles.logo} accessibilityLabel="SBL · Украшения и кофе" />

        <Animated.View key={step} style={{ opacity: entrance }}>
        {step === 'phone' ? (
          <>
            <View style={styles.modeTabs}>
              {[['register', 'Создать аккаунт'], ['login', 'Войти']].map(([id, label]) => <TouchableOpacity key={id} onPress={() => { setMode(id); setError(''); }} disabled={loading} accessibilityRole="tab" accessibilityState={{ selected: mode === id }} style={[styles.modeTab, mode === id && styles.modeSelected]}><Text style={[styles.modeText, mode === id && styles.modeSelectedText]}>{label}</Text></TouchableOpacity>)}
            </View>
            <Text style={styles.title}>{mode === 'register' ? 'Рады знакомству' : 'С возвращением'}</Text>
            <Text style={styles.subtitle}>
              {WAITCALL_ENABLED ? 'Один звонок — и вы в своём аккаунте. Пароль не нужен.' : 'Войдите по подтверждённому номеру, чтобы сохранять бонусы и историю заказов между устройствами.'}
            </Text>

            {ADMIN_MODE && <View style={styles.testHint}><Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} /><Text style={styles.testHintText}>Режим администратора: подойдёт любой номер и любой код, СМС не отправляется.</Text></View>}
            {!AUTH_AVAILABLE && <View style={styles.testHint}><Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} /><Text style={styles.testHintText}>{'Отправка СМС пока не подключена. Вход станет доступен после настройки сервиса. Меню можно посмотреть без входа.'}</Text></View>}

            {registrationNotice && <View accessibilityRole="alert" style={{ backgroundColor: colors.surface2, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.xl }}><Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 21 }}>{error}</Text></View>}
            {mode === 'register' && <View style={{ marginBottom: spacing.xl }}><AccountProfileFields value={profile} onChange={setProfile} disabled={loading} /></View>}
            <Text style={styles.label}>Номер телефона</Text>
            <View style={styles.field}>
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

            <View style={styles.consentRow}>
              <TouchableOpacity onPress={() => setConsent(!consent)} disabled={loading} accessibilityRole="checkbox" accessibilityLabel="Согласие на обработку персональных данных" accessibilityState={{ checked: consent }} style={styles.checkTouch}><View style={[styles.check, consent && styles.checkSelected]}>{consent && <Ionicons name="checkmark" size={16} color={colors.textOnDark} />}</View></TouchableOpacity>
              <Text style={styles.consentCopy}>Согласен на <Text onPress={() => setDocumentsOpen(true)} accessibilityRole="link" style={styles.consentLink}>обработку персональных данных</Text> и ознакомлен с <Text onPress={() => setDocumentsOpen(true)} accessibilityRole="link" style={styles.consentLink}>политикой конфиденциальности</Text>.</Text>
            </View>
            <View style={{ marginTop: spacing.lg }}>
              <PrimaryButton
                variant="holo"
                label={secondsLeft > 0 ? `Повторить через ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : WAITCALL_ENABLED ? 'Получить номер для звонка' : 'Получить код'}
                onPress={submitPhone}
                disabled={!phoneValid || !AUTH_AVAILABLE || secondsLeft > 0 || !consent || (mode === 'register' && !profileValid)}
                loading={loading}
                fullWidth
              />
            </View>

            {!!error && !registrationNotice && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
            {secondsLeft > 0 && <Text style={styles.cooldown}>Новый запрос будет доступен после обратного отсчёта</Text>}
            <TouchableOpacity onPress={() => setDocumentsOpen(true)} accessibilityRole="button" accessibilityLabel="Политика конфиденциальности и контакты" style={styles.resend}>
              <Text style={styles.resendText}>Политика конфиденциальности</Text>
            </TouchableOpacity>
          </>
        ) : step === 'profile' ? (
          <>
            <Text style={styles.title}>Ваш профиль</Text>
            <Text style={styles.subtitle}>Номер подтверждён. Осталось сохранить имя и фото.</Text>
            <AccountProfileFields value={profile} onChange={setProfile} disabled={loading} />
            {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
            <View style={{ marginTop: spacing.lg }}><PrimaryButton variant="holo" fullWidth label="Сохранить профиль" loading={loading} disabled={!profileValid} onPress={async () => {
              if (busyRef.current) return;
              busyRef.current = true; setLoading(true); setError('');
              try { await completeLogin(pendingAccount); } catch { setError('Не удалось сохранить. Проверьте соединение и повторите.'); }
              finally { busyRef.current = false; if (mountedRef.current) setLoading(false); }
            }} /></View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.resend} accessibilityRole="button"><Text style={styles.resendText}>Заполнить позже</Text></TouchableOpacity>
          </>
        ) : step === 'call' ? (
          <>
            <Text style={styles.title}>Подтвердите номер</Text>
            <Text style={styles.subtitle}>Позвоните с номера <Text style={styles.callPhoneInline}>{destination}</Text>. Мы подтвердим вход автоматически — код вводить не нужно.</Text>
            <View style={styles.callCard}>
              <View style={styles.numberPanel}><Text style={styles.numberCaption}>НОМЕР ДЛЯ ЗВОНКА</Text><Text key={challenge?.attemptId} style={[styles.callNumber, { fontSize: callNumberFontSize, width: '100%' }]} selectable numberOfLines={1} adjustsFontSizeToFit={Platform.OS !== 'android'} minimumFontScale={0.68}>{formatPhone(challenge?.callNumber)}</Text></View>
              <View style={{ marginTop: spacing.lg }}><PrimaryButton variant="holo" fullWidth label="Позвонить сейчас" disabled={callLeft <= 0} onPress={() => Linking.openURL(`tel:${challenge.callNumber}`).catch(() => setError('Не удалось открыть телефон. Наберите номер вручную.'))} /></View>
              <View style={styles.callTimerRow}><Ionicons name="time-outline" size={15} color={colors.textMuted} /><Text style={styles.callTimer}>Номер действует ещё {Math.floor(callLeft / 60)}:{String(callLeft % 60).padStart(2, '0')}</Text></View>
            </View>
            <View style={styles.waitingNote}><Text style={styles.legal}>{callLeft ? 'Ожидаем подтверждающий звонок. После него вы автоматически войдёте в аккаунт.' : 'Время ожидания истекло. Вернитесь и запросите новый номер.'}</Text></View>
            {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
            <TouchableOpacity onPress={backFromCode} accessibilityRole="button" style={styles.resend}><Text style={styles.resendText}>Изменить номер или начать заново</Text></TouchableOpacity>
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
        </Animated.View>
      </ScrollView>
      <AccountDocumentsScreen visible={documentsOpen} onClose={() => setDocumentsOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  logo: { alignSelf: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  modeTabs: { flexDirection: 'row', backgroundColor: colors.surface0, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, padding: 4, marginBottom: spacing.xl },
  modeTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  modeSelected: { backgroundColor: colors.darkSurface },
  modeText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  modeSelectedText: { color: colors.textOnDark },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg },
  checkTouch: { width: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  consentCopy: { flex: 1, fontSize: 12, lineHeight: 19, color: colors.textSecondary, paddingTop: 3 },
  consentLink: { color: colors.accent, textDecorationLine: 'underline' },
  cooldown: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: colors.textSecondary, marginTop: spacing.sm },
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
  divider: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.md, marginTop: spacing.xl },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  dividerText: { fontSize: 13, color: colors.textMuted },
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
  callKicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: spacing.sm },
  callPhoneInline: { color: colors.textPrimary, fontWeight: '700' },
  callCard: { backgroundColor: colors.surface1, borderRadius: radius.large, padding: spacing.xl, marginTop: -spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadow.level2 },
  callCardTop: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.md, marginBottom: spacing.xl },
  callIcon: { width: 46, height: 46, borderRadius: radius.medium, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  callCardHeading: { flex: 1 },
  callEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  callLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 4 },
  securePill: { flexDirection: 'row', alignItems: 'center', columnGap: 4, backgroundColor: 'rgba(38,138,88,0.09)', borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 9 },
  secureText: { color: colors.success, fontSize: 11, fontWeight: '700' },
  numberPanel: { backgroundColor: colors.surface0, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  numberCaption: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  callNumber: { color: colors.textPrimary, fontSize: 28, lineHeight: 42, minHeight: 44, includeFontPadding: true, textAlignVertical: 'center', fontWeight: '800', marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  callButtonWrap: { overflow: 'hidden', borderRadius: radius.pill, marginTop: spacing.lg, ...shadow.button },
  callButton: { minHeight: 58, flexDirection: 'row', columnGap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  callButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  callTimerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', columnGap: 6, marginTop: spacing.md },
  callTimer: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  waitingNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', columnGap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.md },
  waitingDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.success, marginTop: 5 },
});
