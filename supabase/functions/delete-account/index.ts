// Self-service account deletion (App Store 5.1.1(v)). The caller is identified only from their
// own session; the service role then anonymizes finished orders and deletes the Auth user.
// Deploy: npx supabase functions deploy delete-account --no-verify-jwt (auth is checked here).
import { createClient } from '@supabase/supabase-js';
import { admin, anonKey, cors, json, url } from '../_shared/waitcall.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Войдите в аккаунт, чтобы удалить его' }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user?.id) return json({ error: 'Сессия устарела. Войдите снова и повторите' }, 401);

  const db = admin();
  const { error: prepareError } = await db.rpc('prepare_account_deletion', { p_user: user.id });
  if (prepareError) {
    const text = String(prepareError.message || '');
    if (text.startsWith('ACTIVE_ORDERS')) return json({ error: 'Сначала дождитесь выдачи или отмены текущего заказа, затем удалите аккаунт' }, 409);
    if (text.startsWith('STAFF_ACCOUNT')) return json({ error: 'Аккаунт сотрудника удаляет владелец кофейни' }, 403);
    console.error('[delete-account] prepare failed', prepareError.code || 'unknown');
    return json({ error: 'Не удалось удалить аккаунт. Повторите позже' }, 503);
  }
  // prepare_account_deletion also deletes the Auth user (the gateway does not expose the Auth admin API).
  return json({ ok: true });
});
