// Only a signed SMSC callback unlocks the server-held Supabase OTP.
import { createClient } from '@supabase/supabase-js';
import { admin, anonKey, callerUser, cors, json, url } from '../_shared/waitcall.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const user = await callerUser(request);
  if (!user) return json({ error: 'Необходима гостевая сессия' }, 401);
  let attemptId: string;
  let mode: 'phone_change' | 'sms';
  try { ({ attemptId, mode } = await request.json()); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(attemptId || '') || !['phone_change', 'sms'].includes(mode)) {
    return json({ error: 'INVALID_REQUEST' }, 400);
  }
  const db = admin();
  const { data: attempt, error } = await db.from('waitcall_auth_attempts')
    .select('id,requester_id,phone,otp,verified,consumed,expires_at')
    .eq('id', attemptId).eq('requester_id', user.id).maybeSingle();
  if (error) return json({ error: 'Сервис временно недоступен' }, 503);
  if (!attempt || attempt.consumed || new Date(attempt.expires_at).getTime() <= Date.now()) return json({ error: 'Время звонка истекло. Запросите новый номер' }, 410);
  if (!attempt.verified || !attempt.otp) return json({ ok: false, pending: true });

  // Let Supabase Auth, not this function, create the session and verify the OTP.
  // A new phone upgrades the current anonymous account and therefore requires
  // its guest JWT. Signing into an existing phone account is unauthenticated.
  const authorization = request.headers.get('Authorization')!;
  const auth = createClient(url, anonKey, mode === 'phone_change'
    ? { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } }
    : { auth: { persistSession: false } });
  const result = await auth.auth.verifyOtp({ phone: attempt.phone, token: attempt.otp, type: mode });
  if (result.error) {
    const diagnostic = `verify:${result.error.code || result.error.message || 'unknown'}`.slice(0, 160);
    console.error('[complete-waitcall] verifyOtp', diagnostic);
    await db.from('waitcall_auth_attempts').update({ last_error: diagnostic }).eq('id', attempt.id);
    return json({ error: 'Не удалось подтвердить вход. Повторите попытку' }, 502);
  }
  if (!result.data?.session?.access_token || !result.data.session.refresh_token ||
      String(result.data.user?.phone || '').replace(/\D/g, '') !== attempt.phone.replace(/\D/g, '') || !result.data.user?.phone_confirmed_at || result.data.user?.is_anonymous !== false ||
      (mode === 'phone_change' && result.data.user?.id !== attempt.requester_id)) {
    const diagnostic = `session:${!result.data?.session ? 'missing' : 'invalid_user'}`;
    console.error('[complete-waitcall]', diagnostic);
    await db.from('waitcall_auth_attempts').update({ last_error: diagnostic }).eq('id', attempt.id);
    return json({ error: 'Не удалось подтвердить вход. Повторите попытку' }, 502);
  }
  const { error: consumeError } = await db.from('waitcall_auth_attempts')
    .update({ consumed: true, otp: null }).eq('id', attempt.id).eq('consumed', false);
  if (consumeError) return json({ error: 'Сервис временно недоступен' }, 503);
  return json({ ok: true, accessToken: result.data.session.access_token, refreshToken: result.data.session.refresh_token });
});
