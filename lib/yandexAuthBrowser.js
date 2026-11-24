// Browser hand-off for "Вход через Яндекс". Kept apart from accountService so the pure
// account logic stays testable without native modules.
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// iOS builds offer only the app's own sign-in by call: a third-party login (Яндекс) would require
// an equivalent privacy-focused option such as Sign in with Apple (App Store Guideline 4.8).
export const YANDEX_PLATFORM_SUPPORTED = Platform.OS !== 'ios';

// Completes the popup/redirect round trip on web; no-op on native.
WebBrowser.maybeCompleteAuthSession();

// This exact URL must be listed in Supabase -> Authentication -> URL Configuration -> Redirect URLs.
export const YANDEX_REDIRECT_URL = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/`
  : 'sbl://auth/yandex';

export async function openYandexAuthSession(url, redirectTo) {
  if (Platform.OS === 'web') {
    // Full-page redirect: supabase-js (detectSessionInUrl on web) exchanges the code on return.
    window.location.assign(url);
    return new Promise(() => {});
  }
  return WebBrowser.openAuthSessionAsync(url, redirectTo);
}
