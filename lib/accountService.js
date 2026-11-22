import { supabase, ensureAnonymousSession } from './supabaseClient';
import { unregisterCurrentPushToken } from './notificationService';

export const PHONE_AUTH_ENABLED = process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === 'true';
export const WAITCALL_ENABLED = PHONE_AUTH_ENABLED && process.env.EXPO_PUBLIC_WAITCALL_ENABLED === 'true';
// Режим администратора приложения: любой номер и любой код входят в аккаунт без СМС.
// Включается только EXPO_PUBLIC_ADMIN_LOGIN=true в сборке; по умолчанию выключен.
// Аккаунт локальный: Supabase-сессия остаётся анонимной, телефон не подтверждается
// сервером. Для боевой сборки флаг должен быть выключен.
export const ADMIN_LOGIN_ENABLED = process.env.EXPO_PUBLIC_ADMIN_LOGIN === 'true';
export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 60;

function accountError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
  if (!/^\d{10}$/.test(digits)) {
    throw accountError('INVALID_PHONE', 'Введите российский номер телефона полностью: +7 и 10 цифр.');
  }
  return `+7${digits}`;
}

// Local UI projection only. Authorization remains in Supabase Auth and RLS.
// A cached phone string or an unconfirmed phone change is never an account.
export function getVerifiedAccount(sessionOrUser) {
  const user = sessionOrUser?.user || sessionOrUser;
  if (!user?.id || user.is_anonymous !== false || !user.phone_confirmed_at || !user.phone) return null;
  try { return { id: user.id, phone: normalizePhone(user.phone) }; }
  catch { return null; }
}

export function describeAuthError(error) {
  const code = error?.code;
  if (['phone_provider_disabled', 'provider_disabled', 'otp_disabled', 'signup_disabled', 'anonymous_provider_disabled', 'manual_linking_disabled'].includes(code)) {
    return WAITCALL_ENABLED ? 'Вход по звонку ещё не настроен. Пока можно посмотреть меню.' : 'Вход по СМС ещё не настроен. Пока можно посмотреть меню; попробуйте войти позже.';
  }
  if (['over_sms_send_rate_limit', 'over_request_rate_limit'].includes(code)) return 'Слишком много запросов. Подождите немного и повторите.';
  if (['otp_expired', 'invalid_credentials', 'otp_disabled_or_expired', 'validation_failed'].includes(code)) return 'Код неверный или истёк. Проверьте его либо запросите новый.';
  if (code === 'user_not_found') return 'Не удалось найти аккаунт с этим номером. Попробуйте зарегистрироваться заново.';
  if (code === 'PHONE_AUTH_DISABLED') return 'Отправка СМС пока не подключена. Вход станет доступен после настройки сервиса.';
  if (code === 'WAITCALL_UNAVAILABLE') return error.message;
  if (/^hook_/.test(String(code || '')) || /NO_PENDING_WAITCALL/.test(String(error?.message || ''))) return 'Не удалось подготовить вход по звонку. Проверьте настройки сервиса.';
  if (['INVALID_PHONE', 'INVALID_CODE', 'OTP_COOLDOWN', 'SESSION_CHANGED', 'ALREADY_SIGNED_IN', 'PHONE_NOT_CONFIRMED'].includes(code)) return error.message;
  return 'Не удалось выполнить вход. Проверьте интернет и попробуйте ещё раз.';
}

export function createAccountService({
  client, ensureSession, removePushToken = async () => {},
  enabled = false, adminEnabled = false, now = () => Date.now(),
}) {
  const resendAt = new Map();
  let sending = false;
  let verifying = false;

  function requireEnabled() {
    if (!enabled) throw accountError('PHONE_AUTH_DISABLED', 'Отправка СМС пока не подключена.');
  }

  function reserveSend(phone) {
    const until = resendAt.get(phone) || 0;
    if (until > now()) throw accountError('OTP_COOLDOWN', 'Новый код можно запросить через минуту.', { retryAt: until });
    const retryAt = now() + OTP_RESEND_SECONDS * 1000;
    resendAt.set(phone, retryAt);
    for (const [number, time] of resendAt) if (time < now() - 3600000) resendAt.delete(number);
    return retryAt;
  }

  async function startPhoneSignIn(value) {
    requireEnabled();
    const phone = normalizePhone(value);
    if (sending) throw accountError('REQUEST_IN_PROGRESS', 'Запрос кода уже выполняется.');
    const retryAt = reserveSend(phone);
    sending = true;
    try {
      await ensureSession();
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      const previousUser = data?.user;
      if (!previousUser?.id) throw accountError('SESSION_CHANGED', 'Сессия закончилась. Закройте окно входа и попробуйте снова.');
      if (getVerifiedAccount(previousUser)) throw accountError('ALREADY_SIGNED_IN', 'Вы уже вошли. Сначала выйдите из аккаунта, чтобы использовать другой номер.');
      if (previousUser.is_anonymous !== true) throw accountError('SESSION_CHANGED', 'Завершите текущий вход и попробуйте снова.');

      // Supabase links a new phone identity to the guest, preserving its uid.
      // Only the explicit machine code phone_exists permits existing-user login.
      const update = await client.auth.updateUser({ phone });
      if (!update.error) return { phone, mode: 'phone_change', previousUserId: previousUser.id, retryAt };
      if (update.error.code !== 'phone_exists') throw update.error;

      const signIn = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
      if (signIn.error) throw signIn.error;
      return { phone, mode: 'sms', previousUserId: previousUser.id, retryAt };
    } catch (error) {
      if (!error.retryAt) error.retryAt = retryAt;
      throw error;
    } finally { sending = false; }
  }

  async function resendPhoneSignIn(challenge) {
    requireEnabled();
    const phone = normalizePhone(challenge?.phone);
    if (!['phone_change', 'sms'].includes(challenge?.mode) || !challenge.previousUserId) {
      throw accountError('SESSION_CHANGED', 'Введите номер заново.');
    }
    if (sending) throw accountError('REQUEST_IN_PROGRESS', 'Запрос кода уже выполняется.');
    const retryAt = reserveSend(phone);
    sending = true;
    try {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      if (data?.user?.id !== challenge.previousUserId || data.user.is_anonymous !== true) {
        throw accountError('SESSION_CHANGED', 'Сессия изменилась. Введите номер заново.');
      }
      const result = await client.auth.resend({ type: challenge.mode, phone });
      if (result.error) throw result.error;
      return { ...challenge, phone, retryAt };
    } catch (error) {
      if (!error.retryAt) error.retryAt = retryAt;
      throw error;
    } finally { sending = false; }
  }

  async function verifyPhoneSignIn({ phone: rawPhone, token, mode, previousUserId }) {
    requireEnabled();
    const phone = normalizePhone(rawPhone);
    if (!/^\d{6}$/.test(String(token || ''))) throw accountError('INVALID_CODE', 'Введите все 6 цифр кода из СМС.');
    if (!['phone_change', 'sms'].includes(mode) || !previousUserId) throw accountError('SESSION_CHANGED', 'Введите номер заново.');
    if (verifying) throw accountError('REQUEST_IN_PROGRESS', 'Код уже проверяется.');
    verifying = true;
    try {
      const current = await client.auth.getUser();
      if (current.error) throw current.error;
      if (current.data?.user?.id !== previousUserId || current.data.user.is_anonymous !== true) {
        throw accountError('SESSION_CHANGED', 'Сессия изменилась. Введите номер заново.');
      }
      // Switching to an existing phone account must not retain this device's
      // registration for the previous user. Never sign out to force a login.
      if (mode === 'sms') await removePushToken({ userId: previousUserId });
      const result = await client.auth.verifyOtp({ phone, token: String(token), type: mode });
      if (result.error) throw result.error;
      let user = result.data?.user || result.data?.session?.user;
      if (!getVerifiedAccount(user)) {
        const refreshed = await client.auth.getUser();
        if (refreshed.error) throw refreshed.error;
        user = refreshed.data?.user;
      }
      const account = getVerifiedAccount(user);
      if (!account || account.phone !== phone || (mode === 'phone_change' && account.id !== previousUserId)) {
        throw accountError('PHONE_NOT_CONFIRMED', 'Сервер не подтвердил номер. Введите его заново.');
      }
      return account;
    } finally { verifying = false; }
  }

  async function startWaitCallSignIn(value) {
    requireEnabled();
    const phone = normalizePhone(value);
    await ensureSession();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user?.id || user.is_anonymous !== true) throw accountError('SESSION_CHANGED', 'Обновите гостевую сессию и попробуйте снова.');
    const { data: started, error: startError } = await client.functions.invoke('start-waitcall', { body: { phone } });
    if (startError || !started?.attemptId || !started?.callNumber) throw accountError('WAITCALL_UNAVAILABLE', 'Не удалось получить номер для звонка. Попробуйте позже.');
    // Preserve the guest uid when this phone is new. Existing phone accounts
    // must use a normal SMS sign-in challenge instead.
    const update = await client.auth.updateUser({ phone });
    let mode = 'phone_change';
    if (update.error) {
      if (update.error.code !== 'phone_exists') throw update.error;
      const signIn = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
      if (signIn.error) throw signIn.error;
      mode = 'sms';
    }
    return { phone, mode, previousUserId: user.id, attemptId: started.attemptId, callNumber: started.callNumber,
      expiresAt: Date.now() + (started.expiresIn || 900) * 1000 };
  }

  async function checkWaitCallSignIn(challenge) {
    if (!challenge?.attemptId || !challenge?.previousUserId || !['phone_change', 'sms'].includes(challenge?.mode)) {
      throw accountError('SESSION_CHANGED', 'Запросите новый номер для звонка.');
    }
    const { data: current, error: currentError } = await client.auth.getUser();
    if (currentError || current?.user?.id !== challenge.previousUserId || current.user.is_anonymous !== true) {
      throw accountError('SESSION_CHANGED', 'Сессия изменилась. Начните вход заново.');
    }
    const { data, error } = await client.functions.invoke('complete-waitcall', {
      body: { attemptId: challenge.attemptId, mode: challenge.mode },
    });
    if (error) throw accountError('WAITCALL_UNAVAILABLE', 'Не удалось проверить звонок. Попробуйте снова.');
    if (data?.pending) return null;
    if (!data?.ok || !data.accessToken || !data.refreshToken) throw accountError('WAITCALL_UNAVAILABLE', data?.error || 'Не удалось подтвердить звонок.');
    await removePushToken({ userId: challenge.previousUserId });
    const session = await client.auth.setSession({ access_token: data.accessToken, refresh_token: data.refreshToken });
    if (session.error) throw session.error;
    const account = getVerifiedAccount(session.data?.user || session.data?.session?.user);
    if (!account || account.phone !== challenge.phone) throw accountError('PHONE_NOT_CONFIRMED', 'Сервер не подтвердил номер.');
    return account;
  }

  async function adminSignIn(value) {
    if (!adminEnabled) throw accountError('ADMIN_LOGIN_DISABLED', 'Вход администратора выключен.');
    const phone = normalizePhone(value);
    await ensureSession();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user?.id) throw accountError('SESSION_CHANGED', 'Сессия закончилась. Закройте окно входа и попробуйте снова.');
    if (getVerifiedAccount(user)) throw accountError('ALREADY_SIGNED_IN', 'Вы уже вошли. Сначала выйдите из аккаунта, чтобы использовать другой номер.');
    return { id: user.id, phone, admin: true };
  }

  async function signOutAccount() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const userId = data?.session?.user?.id;
    await removePushToken({ userId });
    const result = await client.auth.signOut({ scope: 'local' });
    if (result.error) throw result.error;
  }

  async function requestAccountDeletion() {
    const { data, error } = await client.rpc('request_account_deletion');
    if (error) throw error;
    if (!data?.id || !data?.status) throw accountError('INVALID_RESPONSE', 'Не удалось подтвердить приём запроса.');
    return data;
  }

  async function fetchDeletionRequest() {
    const { data, error } = await client.rpc('get_account_deletion_request');
    if (error) throw error;
    return data || null;
  }

  return { startPhoneSignIn, resendPhoneSignIn, verifyPhoneSignIn, startWaitCallSignIn, checkWaitCallSignIn, adminSignIn, signOutAccount, requestAccountDeletion, fetchDeletionRequest };
}

const service = createAccountService({
  client: supabase, ensureSession: ensureAnonymousSession,
  removePushToken: unregisterCurrentPushToken, enabled: PHONE_AUTH_ENABLED, adminEnabled: ADMIN_LOGIN_ENABLED,
});
export const startPhoneSignIn = service.startPhoneSignIn;
export const resendPhoneSignIn = service.resendPhoneSignIn;
export const verifyPhoneSignIn = service.verifyPhoneSignIn;
export const startWaitCallSignIn = service.startWaitCallSignIn;
export const checkWaitCallSignIn = service.checkWaitCallSignIn;
export const adminSignIn = service.adminSignIn;
export const signOutAccount = service.signOutAccount;
export const requestAccountDeletion = service.requestAccountDeletion;
export const fetchDeletionRequest = service.fetchDeletionRequest;
