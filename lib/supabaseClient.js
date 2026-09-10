// lib/supabaseClient.js
// Единый клиент Supabase для всего приложения. Backend уже развёрнут и
// схема/RLS не меняются здесь — этот файл только подключает приложение к
// существующему проекту.
// Metro не резолвит subpath-импорт 'react-native-url-polyfill/auto' через
// pnpm-симлинки в этом проекте, поэтому вызываем тот же setup вручную из
// главного экспорта пакета — эквивалентно auto.js, но без subpath-импорта.
import { Platform } from 'react-native';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

if (Platform.OS !== 'web') {
  setupURLPolyfill();
}

const SUPABASE_URL = 'https://vxefueynagwuavlyeiqc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OD1Fh_a_qhnjKeMd30RQRA_WgpOXZwq';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Приложение не открывает supabase-ссылки через deep link на этом этапе —
    // парсинг сессии из URL здесь не нужен и на RN не имеет смысла.
    detectSessionInUrl: false,
  },
});

/**
 * Гарантирует, что у пользователя есть рабочая сессия (auth.uid()), не
 * показывая никакого экрана регистрации. Если сессии нет — тихо создаёт
 * анонимную. Вызывается один раз при старте приложения; при неудаче не
 * бросает пользователю модалку (см. App.js) — реальная ошибка всё равно
 * всплывёт заметно в момент оформления заказа (getUserOrThrow ниже).
 */
export async function ensureAnonymousSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

/**
 * Достаёт текущего пользователя, при отсутствии сессии сначала пытается
 * тихо восстановить/создать анонимную — на случай, если сессия ещё не
 * успела подняться при старте приложения (например, самый первый запуск).
 */
export async function getUserOrThrow() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user;

  await ensureAnonymousSession();
  const { data: { user: retriedUser }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!retriedUser) throw new Error('Не удалось определить пользователя. Проверьте подключение к интернету.');
  return retriedUser;
}
