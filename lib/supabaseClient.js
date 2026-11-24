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

// Expo substitutes these public variables at build time. Both must be provided
// together so a local URL cannot accidentally use a production key.
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!!configuredUrl !== !!configuredKey) {
  throw new Error('Для другого Supabase задайте одновременно URL и публичный ключ.');
}
// Default is our own VPS: the hosted Supabase project is decommissioned, and a build that
// forgot the variables must not silently talk to it. The anon key is public by design.
const SUPABASE_URL = configuredUrl || 'https://31.31.207.216/coffee';
const SUPABASE_PUBLISHABLE_KEY = configuredKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiAiaHR0cHM6Ly8zMS4zMS4yMDcuMjE2L2NvZmZlZS9hdXRoL3YxIiwgInJvbGUiOiAiYW5vbiIsICJhdWQiOiAiYXV0aGVudGljYXRlZCIsICJpYXQiOiAxNzk1MzU2NjY5LCAiZXhwIjogMTk1MzAzNjY2OX0.Q_wS908tSiNbtlU07GpeQq2VD2_mZPvCgTKZW_OFLfY';

// The coffee gateway serves REST, Auth and Storage. Hosted Supabase also serves Realtime.
export const pollingOnly = /^https?:\/\/[^/]+\/coffee\/*$/.test(SUPABASE_URL);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Вход только по номеру телефона (звонок): сессии из URL не принимаются.
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
