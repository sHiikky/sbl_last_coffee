import { admin, sameText } from '../_shared/waitcall.ts';
const secret = Deno.env.get('SMSC_CALLBACK_SECRET') || '';
const encoder = new TextEncoder();

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  if (secret.length < 24) return new Response('Unavailable', { status: 503 });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return new Response('Not found', { status: 404 });
    const payload: any = (request.headers.get('Content-Type') || '').includes('application/json')
      ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    if (String(payload.waitcall) !== '1') return new Response('ok');
    const phone = String(payload.phone || '');
    const ts = String(payload.ts || '');
    const signature = String(payload.sha1 || '').toLowerCase();
    if (!/^\+?7\d{10}$/.test(phone) || !/^\d{10}$/.test(ts) || !/^[0-9a-f]{40}$/.test(signature)) return new Response('Not found', { status: 404 });
    const eventTime = Number(ts) * 1000;
    if (Math.abs(Date.now() - eventTime) > 16 * 60_000) return new Response('Not found', { status: 404 });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', encoder.encode(`${phone}:${ts}:${secret}`)));
    const expected = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (!sameText(signature, expected)) return new Response('Not found', { status: 404 });
    const db = admin();
    const { data: attempt, error } = await db.from('waitcall_auth_attempts').select('id')
      .eq('phone', `+${phone.replace(/^\+/, '')}`).eq('consumed', false).eq('verified', false)
      .not('call_number', 'is', null)
      .lte('created_at', new Date(eventTime).toISOString())
      .gte('expires_at', new Date(Math.max(Date.now(), eventTime)).toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (attempt) {
      const { error: updateError } = await db.from('waitcall_auth_attempts').update({ verified: true }).eq('id', attempt.id).eq('consumed', false);
      if (updateError) throw updateError;
    }
    return new Response('ok');
  } catch (error) {
    console.error('[smsc-waitcall-callback]', error instanceof Error ? error.name : 'unknown');
    return new Response('Retry', { status: 500 });
  }
});
