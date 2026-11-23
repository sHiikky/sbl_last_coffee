import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { getVerifiedAccount } from './accountService';
import { writeLocalAvatar } from './localAvatar';

const DRAFT_KEY = 'sbl.registration-draft.v1';
export function normalizeProfileName(value) { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 60); }
export function hasCompleteProfile(account) { return !!normalizeProfileName(account?.firstName) && !!normalizeProfileName(account?.lastName); }

export async function saveAccountProfile(userId, values) {
  const firstName = normalizeProfileName(values.firstName), lastName = normalizeProfileName(values.lastName);
  if (!firstName || !lastName) throw new Error('Укажите имя и фамилию.');
  const current = await supabase.auth.getUser();
  if (current.error) throw current.error;
  if (current.data?.user?.id !== userId || !getVerifiedAccount(current.data.user)) throw new Error('Сессия изменилась. Откройте профиль заново.');
  // Only names go to Auth. A photo is deliberately never sent to the backend.
  const result = await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}` } });
  if (result.error) throw result.error;
  return getVerifiedAccount(result.data.user);
}

export async function saveRegistrationDraft(values) {
  const { data } = await supabase.auth.getSession();
  const guest = data?.session?.user;
  if (!guest?.id || guest.is_anonymous !== true) return;
  // Used only to finish a guest's Yandex upgrade after the web redirect.
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ guestId: guest.id, firstName: normalizeProfileName(values.firstName), lastName: normalizeProfileName(values.lastName), avatarUri: values.avatarUri || null, createdAt: Date.now() }));
}

export async function finishRegistrationDraft(account) {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return account;
  let draft;
  try { draft = JSON.parse(raw); } catch { await AsyncStorage.removeItem(DRAFT_KEY); return account; }
  if (!account?.id || !draft.createdAt || Date.now() - draft.createdAt > 30 * 60 * 1000 || draft.guestId !== account.id) {
    await AsyncStorage.removeItem(DRAFT_KEY); return account;
  }
  let updated = account;
  if (!hasCompleteProfile(account) && draft.firstName && draft.lastName) updated = await saveAccountProfile(account.id, draft);
  if (draft.avatarUri) await writeLocalAvatar(account.id, draft.avatarUri);
  await AsyncStorage.removeItem(DRAFT_KEY);
  return updated;
}
