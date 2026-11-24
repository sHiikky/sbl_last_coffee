import { supabase } from './supabaseClient';
import { getVerifiedAccount } from './accountService';

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
