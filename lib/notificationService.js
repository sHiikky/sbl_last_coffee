import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabaseClient';

export const PUSH_NOTIFICATIONS_ENABLED = process.env.EXPO_PUBLIC_PUSH_NOTIFICATIONS_ENABLED === 'true';
const INSTALLATION_KEY = 'sbl_push_installation_v1';
const REGISTRATION_KEY = 'sbl_push_registration_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

function pushError(code, message) { return Object.assign(new Error(message), { code }); }

export function describeNotificationError(error) {
  if (['PGRST202', '42883', 'PUSH_NOT_CONFIGURED'].includes(error?.code)) return 'Сервис уведомлений пока не настроен. Статус заказа доступен в приложении.';
  if (['UNSUPPORTED_PLATFORM', 'PUSH_DISABLED', 'EXPO_GO_UNSUPPORTED', 'PROJECT_ID_MISSING', 'PERMISSION_DENIED', 'VERIFIED_ACCOUNT_REQUIRED', 'SESSION_CHANGED'].includes(error?.code)) return error.message;
  if (/FirebaseApp|google-services|\bFCM\b|\bAPNs\b|credentials|projectId/i.test(error?.message || '')) return 'Настройка уведомлений для этой сборки ещё не завершена. Пока проверяйте статус в приложении.';
  if (/physical device|emulator|simulator/i.test(error?.message || '')) return 'Проверить уведомления можно на реальном телефоне с установленной сборкой SBL.';
  return 'Не удалось изменить уведомления. Проверьте интернет и попробуйте ещё раз.';
}

export function createNotificationService({
  client, storage, notifications, platform, constants = {}, enabled = false,
  randomUUID, now = () => new Date().toISOString(),
}) {
  let mutation = Promise.resolve();
  function serial(task) {
    const result = mutation.then(task);
    mutation = result.catch(() => {});
    return result;
  }

  function support() {
    if (!['android', 'ios'].includes(platform)) return { supported: false, message: 'В браузере уведомления недоступны. Проверить статус заказа можно в приложении.' };
    if (constants.executionEnvironment === 'storeClient' || constants.appOwnership === 'expo') return { supported: false, message: 'Для уведомлений нужна установленная сборка SBL на телефоне. В Expo Go они недоступны.' };
    if (!enabled) return { supported: false, message: 'Уведомления пока не подключены. Статус заказа доступен в приложении.' };
    return { supported: true, message: null };
  }

  async function storedRegistration() {
    const raw = await storage.getItem(REGISTRATION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch { return null; }
  }

  async function getInstallationId() {
    const saved = await storage.getItem(INSTALLATION_KEY);
    if (saved && UUID.test(saved)) return saved;
    const id = randomUUID();
    if (!UUID.test(id)) throw pushError('INVALID_INSTALLATION', 'Не удалось определить устройство.');
    await storage.setItem(INSTALLATION_KEY, id);
    return id;
  }

  async function currentUser() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user?.id) throw pushError('VERIFIED_ACCOUNT_REQUIRED', 'Не удалось определить пользователя. Откройте приложение заново.');
    return user;
  }

  async function getOrderNotificationSettings() {
    const supported = support();
    const registration = await storedRegistration();
    const session = await client.auth.getSession();
    if (session.error) throw session.error;
    const userId = session.data?.session?.user?.id || null;
    const owned = !!registration?.enabled && registration.userId === userId;
    if (!supported.supported) return { ...supported, enabled: owned, permission: 'unavailable', userId };
    const permission = await notifications.getPermissionsAsync();
    return { ...supported, userId, enabled: owned && permission.granted === true, permission: permission.status, canAskAgain: permission.canAskAgain, registered: owned };
  }

  async function register({ requestPermission }) {
    const available = support();
    if (!available.supported) throw pushError(platform === 'web' ? 'UNSUPPORTED_PLATFORM' : enabled ? 'EXPO_GO_UNSUPPORTED' : 'PUSH_DISABLED', available.message);
    const user = await currentUser();
    const projectId = constants.easConfig?.projectId || constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || !UUID.test(projectId)) throw pushError('PROJECT_ID_MISSING', 'Уведомления ещё не настроены для этой сборки.');

    if (platform === 'android') {
      await notifications.setNotificationChannelAsync('orders', { name: 'Заказы SBL', importance: notifications.AndroidImportance.HIGH, sound: 'default' });
      await notifications.setNotificationChannelAsync('promotions', { name: 'Акции и новости SBL', importance: notifications.AndroidImportance.DEFAULT, sound: 'default' });
      await notifications.setNotificationChannelAsync('series', { name: 'Серия SBL', importance: notifications.AndroidImportance.DEFAULT, sound: 'default' });
    }
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted && requestPermission && permission.canAskAgain !== false) permission = await notifications.requestPermissionsAsync();
    if (!permission.granted) throw pushError('PERMISSION_DENIED', 'Уведомления запрещены. Разрешить их можно в настройках телефона.');

    const tokenResult = await notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult?.data;
    if (!EXPO_TOKEN.test(token || '')) throw pushError('TOKEN_NOT_AVAILABLE', 'Не удалось получить адрес уведомлений этого устройства.');
    const installationId = await getInstallationId();
    // Token acquisition is asynchronous. Do not attach it if the account
    // changed while the OS/Expo dialogue was open.
    const current = await currentUser();
    if (current.id !== user.id) throw pushError('SESSION_CHANGED', 'Аккаунт изменился. Откройте настройки уведомлений заново.');
    const { error } = await client.rpc('register_device_push_token', {
      p_installation_id: installationId, p_expo_push_token: token, p_platform: platform, p_project_id: projectId,
    });
    if (error) throw error;
    await storage.setItem(REGISTRATION_KEY, JSON.stringify({ enabled: true, userId: user.id, installationId, token, updatedAt: now() }));
    return { supported: true, enabled: true, permission: 'granted', userId: user.id, registered: true };
  }

  const enableOrderNotifications = () => serial(() => register({ requestPermission: true }));

  function unregisterCurrentPushToken({ userId } = {}) {
    return serial(async () => {
      const record = await storedRegistration();
      // Registration may have reached the server while its response or local
      // cache write was lost. The installation id is persisted BEFORE the RPC,
      // so sign-out can still revoke that uncertain registration.
      const installationId = record?.installationId || await storage.getItem(INSTALLATION_KEY);
      if (!installationId || !UUID.test(installationId)) return;
      const session = await client.auth.getSession();
      if (session.error) throw session.error;
      const actualUserId = session.data?.session?.user?.id;
      if (!actualUserId || (userId && actualUserId !== userId) || (record?.userId && record.userId !== actualUserId)) {
        throw pushError('SESSION_CHANGED', 'Не удалось отключить уведомления прежнего аккаунта. Войдите в него и повторите выход.');
      }
      // The server accepts only this user's installation. Revoke before
      // removing local state or ending the authenticated session.
      const { error } = await client.rpc('unregister_device_push_token', { p_installation_id: installationId });
      if (error) throw error;
      await storage.removeItem(REGISTRATION_KEY);
    });
  }

  const disableOrderNotifications = () => unregisterCurrentPushToken();

  function refreshPushRegistration({ userId } = {}) {
    return serial(async () => {
      if (!support().supported) return null;
      const record = await storedRegistration();
      if (!record?.enabled || !userId || record.userId !== userId) return null;
      const permission = await notifications.getPermissionsAsync();
      if (!permission.granted) {
        const { error } = await client.rpc('unregister_device_push_token', { p_installation_id: record.installationId });
        if (error) throw error;
        await storage.removeItem(REGISTRATION_KEY);
        return null;
      }
      return register({ requestPermission: false });
    });
  }

  return { getRuntimeSupport: support, getOrderNotificationSettings, enableOrderNotifications, disableOrderNotifications, unregisterCurrentPushToken, refreshPushRegistration };
}

const service = createNotificationService({
  client: supabase, storage: AsyncStorage, notifications: Notifications,
  platform: Platform.OS, constants: Constants, enabled: PUSH_NOTIFICATIONS_ENABLED,
  randomUUID: Crypto.randomUUID,
});
export const getOrderNotificationSettings = service.getOrderNotificationSettings;
export const enableOrderNotifications = service.enableOrderNotifications;
export const disableOrderNotifications = service.disableOrderNotifications;
export const unregisterCurrentPushToken = service.unregisterCurrentPushToken;
export const refreshPushRegistration = service.refreshPushRegistration;
export const getOrderNotificationSupport = service.getRuntimeSupport;

// Consent for non-order pushes. Defaults are OFF on the server; the guest turns them on.
export async function getPushPreferences() {
  const { data, error } = await supabase.rpc('get_push_preferences');
  if (error) throw error;
  return {
    promotions: data?.promotions === true,
    seriesReminders: data?.series_reminders === true,
    ...(typeof data?.return_reminders === 'boolean' && { returnReminders: data.return_reminders }),
  };
}
export async function setPushPreferences({ promotions, seriesReminders }) {
  const { data, error } = await supabase.rpc('set_push_preferences', { p_promotions: !!promotions, p_series_reminders: !!seriesReminders });
  if (error) throw error;
  return { promotions: data?.promotions === true, seriesReminders: data?.series_reminders === true };
}

export async function setReturnReminders(enabled) {
  const { data, error } = await supabase.rpc('set_return_reminders', { p_enabled: enabled });
  if (error) throw error;
  return data === true;
}

// Pre-permission prompt bookkeeping: ask at most 3 times, at least 7 days apart,
// and never again after the guest has answered in the system dialog.
const PROMPT_KEY = 'sbl_push_prompt_v1';
const PROMPT_GAP_MS = 7 * 24 * 3600000;
export async function shouldShowPushPrompt(userId, nowMs = Date.now()) {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_KEY);
    const record = raw ? JSON.parse(raw) : null;
    if (!record || record.userId !== userId) return true;
    if (record.done) return false;
    return (record.count || 0) < 3 && nowMs - (record.lastAt || 0) >= PROMPT_GAP_MS;
  } catch { return true; }
}
export async function markPushPrompt(userId, { done = false, nowMs = Date.now() } = {}) {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_KEY);
    const record = raw ? JSON.parse(raw) : null;
    const count = record && record.userId === userId ? (record.count || 0) : 0;
    await AsyncStorage.setItem(PROMPT_KEY, JSON.stringify({ userId, count: count + 1, lastAt: nowMs, done }));
  } catch { /* the prompt may repeat; that is acceptable */ }
}

export function getOrderIdFromNotification(response) {
  const data = response?.notification?.request?.content?.data;
  return data?.type === 'order_status' && UUID.test(String(data.orderId || '')) ? data.orderId : null;
}
