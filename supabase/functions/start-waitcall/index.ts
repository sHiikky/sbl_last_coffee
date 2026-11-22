import { admin, callerUser, cors, json } from '../_shared/waitcall.ts';
const apiKey = Deno.env.get('SMSC_API_KEY')?.trim();
const login = Deno.env.get('SMSC_LOGIN')?.trim();
const password = Deno.env.get('SMSC_PASSWORD')?.trim();
const credentials = login && password
  ? { login, psw: password }
  : apiKey
    ? { apikey: apiKey }
    : null;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!credentials) return json({ error: 'Звонок пока не настроен' }, 503);
  const user = await callerUser(request);
  if (!user) return json({ error: 'Необходима гостевая сессия или вход через Яндекс' }, 401);
  let phone: string;
  try { phone = (await request.json()).phone; } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (typeof phone !== 'string' || !/^\+7\d{10}$/.test(phone)) return json({ error: 'Проверьте номер телефона' }, 400);
  const db = admin();
  const { data: recent, error: lookupError } = await db.from('waitcall_auth_attempts').select('id,requester_id,created_at,verified,last_error')
    .eq('phone', phone).gte('created_at', new Date(Date.now() - 3600_000).toISOString())
    .order('created_at', { ascending: false }).limit(5);
  if (lookupError) return json({ error: 'Сервис временно недоступен' }, 503);
  if (recent?.length && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) return json({ error: 'Повторите через минуту' }, 429);
  // One explicitly approved support retry, scoped to the phone's latest
  // verified attempt. A fresh guest after sign-out can use the same allowance.
  // Inserting a new attempt invalidates this exception; it also expires.
  const supportRetry = recent?.[0]?.id === Deno.env.get('WAITCALL_RETRY_ATTEMPT_ID')
    && recent[0].verified
    && Date.now() < Date.parse(Deno.env.get('WAITCALL_RETRY_UNTIL') || '');
  if ((recent?.length || 0) >= 5 && !supportRetry) return json({ error: 'Слишком много попыток. Повторите через час' }, 429);
  const { count: userCount, error: userLimitError } = await db.from('waitcall_auth_attempts')
    .select('id', { count: 'exact', head: true }).eq('requester_id', user.id)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if (userLimitError) return json({ error: 'Сервис временно недоступен' }, 503);
  if ((userCount || 0) >= 5 && !supportRetry) return json({ error: 'Слишком много попыток. Повторите через час' }, 429);
  const { data: attempt, error: insertError } = await db.from('waitcall_auth_attempts')
    .insert({ requester_id: user.id, phone }).select('id').single();
  if (insertError?.code === '23505') return json({ error: 'Повторите через минуту' }, 429);
  if (insertError) return json({ error: 'Сервис временно недоступен' }, 503);
  try {
    const provider = await fetch('https://smsc.ru/sys/wait_call.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: new URLSearchParams({ ...credentials, phone, fmt: '3' }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await provider.json();
    if (!provider.ok || result?.error || result?.error_code || typeof result?.phone !== 'string' || !/^\+?\d{10,15}$/.test(result.phone)) {
      console.error('[start-waitcall] SMSC rejected request', Number(result?.error_code) || provider.status);
      throw new Error('PROVIDER_REJECTED');
    }
    const callNumber = `+${result.phone.replace(/^\+/, '')}`;
    const { error } = await db.from('waitcall_auth_attempts').update({ call_number: callNumber }).eq('id', attempt.id);
    if (error) throw error;
    const { error: invalidateError } = await db.from('waitcall_auth_attempts').update({ consumed: true, otp: null })
      .eq('phone', phone).eq('consumed', false).neq('id', attempt.id);
    if (invalidateError) throw invalidateError;
    return json({ attemptId: attempt.id, callNumber, expiresIn: 900 });
  } catch (error) {
    console.error('[start-waitcall]', error instanceof Error ? error.message : 'unknown');
    await db.from('waitcall_auth_attempts').update({ consumed: true }).eq('id', attempt.id);
    return json({ error: 'Не удалось получить номер для звонка' }, 502);
  }
});
