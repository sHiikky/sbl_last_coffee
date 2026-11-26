import { admin, callerUser, cors, json } from '../_shared/waitcall.ts';
const apiKey = Deno.env.get('SMSC_API_KEY')?.trim();
const login = Deno.env.get('SMSC_LOGIN')?.trim();
const password = Deno.env.get('SMSC_PASSWORD')?.trim();
const credentials = login && password
  ? { login, psw: password }
  : apiKey
    ? { apikey: apiKey }
    : null;
let recoveryClaimed = false;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!credentials) return json({ error: 'Звонок пока не настроен' }, 503);
  const user = await callerUser(request);
  if (!user) return json({ error: 'Необходима гостевая сессия' }, 401);
  let phone: string; let intent: string;
  try { const input = await request.json(); phone = input.phone; intent = input.intent || 'register'; } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (typeof phone !== 'string' || !/^\+7\d{10}$/.test(phone)) return json({ error: 'Проверьте номер телефона' }, 400);
  if (!['login', 'register'].includes(intent)) return json({ error: 'INVALID_REQUEST' }, 400);
  const db = admin();
  const { data: recent, error: lookupError } = await db.from('waitcall_auth_attempts').select('id,requester_id,created_at,verified,last_error,consumed,call_number,expires_at')
    .eq('phone', phone).gte('created_at', new Date(Date.now() - 3600_000).toISOString())
    .order('created_at', { ascending: false }).limit(5);
  if (lookupError) return json({ error: 'Сервис временно недоступен' }, 503);
  if (recent?.length && recent[0].last_error !== 'LOGIN_NOT_REGISTERED' && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) return json({ error: 'Повторите через минуту' }, 429);
  // App Review demo sign-in: Apple reviewers have no Russian number to call from. Only the phone
  // set in the REVIEW_DEMO_PHONE secret skips the call; the attempt is born verified, and the normal
  // Supabase OTP (send-waitcall-hook → complete-waitcall) still creates the session. Unset the
  // secret after review to switch this off.
  const demoPhone = (Deno.env.get('REVIEW_DEMO_PHONE') || '').trim();
  if (demoPhone && phone === demoPhone) {
    let demoLoginAccountExists = false;
    if (intent === 'login') {
      const registered = await db.rpc('waitcall_registered_phone', { p_phone: phone });
      if (registered.error) return json({ error: 'Сервис временно недоступен' }, 503);
      if (registered.data !== true) return json({ code: 'PHONE_NOT_REGISTERED', error: 'Этот номер ещё не зарегистрирован. Создайте аккаунт.' }, 404);
      demoLoginAccountExists = true;
    }
    const demoCallNumber = (Deno.env.get('REVIEW_DEMO_CALL_NUMBER') || '+70000000000').trim();
    const { data: demo, error: demoError } = await db.from('waitcall_auth_attempts')
      .insert({ requester_id: user.id, phone, call_number: demoCallNumber, verified: true }).select('id').single();
    if (demoError?.code === '23505') return json({ error: 'Повторите через минуту' }, 429);
    if (demoError || !demo) return json({ error: 'Сервис временно недоступен' }, 503);
    await db.from('waitcall_auth_attempts').update({ consumed: true, otp: null })
      .eq('phone', phone).eq('consumed', false).neq('id', demo.id);
    return json({ loginAccountExists: demoLoginAccountExists, attemptId: demo.id, callNumber: demoCallNumber, expiresIn: 900 });
  }
  // Recover this caller's existing challenge after a client/Auth failure.
  // This allocates no provider number and consumes no additional quota.
  const pending = recent?.[0];
  const remaining = pending ? Math.floor((Date.parse(pending.expires_at) - Date.now()) / 1000) : 0;
  if (intent !== 'login' && pending?.requester_id === user.id && !pending.consumed && !pending.verified && remaining >= 120 &&
      typeof pending.call_number === 'string' && /^\+\d{10,15}$/.test(pending.call_number)) {
    return json({ attemptId: pending.id, callNumber: pending.call_number, expiresIn: remaining });
  }
  // One explicitly approved support retry, scoped to the phone's latest
  // verified attempt. A fresh guest after sign-out can use the same allowance.
  // Inserting a new attempt invalidates this exception; it also expires.
  const supportRetry = !!recent?.[0] && recent[0].id === Deno.env.get('WAITCALL_RETRY_ATTEMPT_ID')
    && recent[0].verified
    && Date.now() < Date.parse(Deno.env.get('WAITCALL_RETRY_UNTIL') || '');
  // A server-configured, one-use recovery for one failed test challenge.
  // The next inserted attempt invalidates the allowance; no OTP/call checks change.
  const recoveryRetry = !recoveryClaimed && !!pending && !pending.verified && remaining <= 0 &&
    pending.id === Deno.env.get('WAITCALL_RECOVERY_ATTEMPT_ID') &&
    pending.requester_id === user.id && user.id === Deno.env.get('WAITCALL_RECOVERY_REQUESTER_ID') &&
    Date.now() < Date.parse(Deno.env.get('WAITCALL_RECOVERY_UNTIL') || '');
  if ((recent?.length || 0) >= 5 && !supportRetry && !recoveryRetry) return json({ error: 'Слишком много попыток. Повторите через час' }, 429);
  const { count: userCount, error: userLimitError } = await db.from('waitcall_auth_attempts')
    .select('id', { count: 'exact', head: true }).eq('requester_id', user.id)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if (userLimitError) return json({ error: 'Сервис временно недоступен' }, 503);
  if ((userCount || 0) >= 5 && !supportRetry && !recoveryRetry) return json({ error: 'Слишком много попыток. Повторите через час' }, 429);
  if (recoveryRetry) {
    if (recoveryClaimed) return json({ error: 'Повторите через минуту' }, 429);
    recoveryClaimed = true;
  }
  const { data: attempt, error: insertError } = await db.from('waitcall_auth_attempts')
    .insert({ requester_id: user.id, phone }).select('id').single();
  if (insertError?.code === '23505') return json({ error: 'Повторите через минуту' }, 429);
  if (insertError) return json({ error: 'Сервис временно недоступен' }, 503);
  let loginAccountExists = false;
  if (intent === 'login') {
    const registered = await db.rpc('waitcall_registered_phone', { p_phone: phone });
    if (registered.error || registered.data !== true) {
      const cleanup = await db.from('waitcall_auth_attempts').update({ consumed: true, otp: null, last_error: registered.error ? 'LOGIN_LOOKUP_FAILED' : 'LOGIN_NOT_REGISTERED' }).eq('id', attempt.id);
      if (registered.error || cleanup.error) return json({ error: 'Сервис временно недоступен' }, 503);
      return json({ code: 'PHONE_NOT_REGISTERED', error: 'Этот номер ещё не зарегистрирован. Создайте аккаунт.' }, 404);
    }
    loginAccountExists = true;
  }
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
    return json({ loginAccountExists, attemptId: attempt.id, callNumber, expiresIn: 900 });
  } catch (error) {
    console.error('[start-waitcall]', error instanceof Error ? error.message : 'unknown');
    await db.from('waitcall_auth_attempts').update({ consumed: true }).eq('id', attempt.id);
    return json({ error: 'Не удалось получить номер для звонка' }, 502);
  }
});
