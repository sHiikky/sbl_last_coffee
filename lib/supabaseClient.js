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

// On web the guest returns from Яндекс/Supabase to this very page; a failed sign-in or link arrives as
// error params in the URL and would otherwise vanish silently (the app just shows the home screen).
// Read it before the auth client touches the URL; no tokens or codes are ever read here.
function readAuthRedirectError() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const read = key => query.get(key) || hash.get(key) || '';
    const code = read('error_code');
    const error = read('error');
    if (!code && !error) return null;
    return { code: code.slice(0, 60), error: error.slice(0, 60), description: read('error_description').slice(0, 200) };
  } catch { return null; }
}
export const authRedirectError = readAuthRedirectError();

// Expo substitutes these public variables at build time. Both must be provided
// together so a local URL cannot accidentally use a production key.
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!!configuredUrl !== !!configuredKey) {
  throw new Error('Для другого Supabase задайте одновременно URL и публичный ключ.');
}
const SUPABASE_URL = configuredUrl || 'https://vxefueynagwuavlyeiqc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = configuredKey || 'sb_publishable_OD1Fh_a_qhnjKeMd30RQRA_WgpOXZwq';

// The coffee gateway serves REST, Auth and Storage. Hosted Supabase also serves Realtime.
export const pollingOnly = /^https?:\/\/[^/]+\/coffee\/*$/.test(SUPABASE_URL);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Вход через Яндекс (custom OAuth2) идёт по PKCE: код из callback бесполезен без verifier,
    // который хранится только в этом приложении.
    flowType: 'pkce',
    // Native обменивает код вручную (lib/accountService.js); на web это делает сам клиент
    // при возврате со страницы Яндекса.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * Гарантирует, что у пользователя есть рабочая сессия (auth.uid()), не
 * показывая никакого экрана регистрации. Если сессии нет — тихо создаёт
 * анонимную. Вызывается один раз при старте приложения; при неудаче не
 * бросает пользователю модалку (см. App.js) — реальная ошибка всё равно
 * всплывёт заметно в момент оформления заказа (getUserOrThrow ниже).
 */
let sessionInFlight = null;

async function loadOrCreateSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export function ensureAnonymousSession() {
  if (!sessionInFlight) {
    sessionInFlight = loadOrCreateSession().finally(() => { sessionInFlight = null; });
  }
  return sessionInFlight;
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
