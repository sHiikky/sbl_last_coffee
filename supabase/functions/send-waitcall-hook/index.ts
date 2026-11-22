// Auth Send SMS hook: hold Supabase's OTP until SMSC confirms the caller.
import { admin, sameText } from '../_shared/waitcall.ts';
const secret = Deno.env.get('SEND_SMS_HOOK_SECRET') || '';
const fail = (status: number, message: string) => Response.json({ error: { http_code: status, message } }, { status });

async function signed(request: Request, body: string) {
  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signatures = request.headers.get('webhook-signature');
  const sentAt = Number(timestamp);
  if (!secret || !id || !timestamp || !signatures || !Number.isInteger(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 300) return false;
  let bytes: Uint8Array;
  try {
    const raw = atob(secret.replace(/^v1,/, '').replace(/^whsec_/, ''));
    bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  } catch { return false; }
  if (!bytes.length) return false;
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return signatures.split(' ').some(entry => {
    const [version, value] = entry.split(',');
    return version === 'v1' && sameText(value || '', expected);
  });
}

Deno.serve(async request => {
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  const body = await request.text();
  if (body.length > 65536) return fail(413, 'BODY_TOO_LARGE');
  if (!(await signed(request, body))) return fail(401, 'INVALID_SIGNATURE');
  let payload: any;
  try { payload = JSON.parse(body); } catch { return fail(400, 'INVALID_JSON'); }
  const otp = String(payload?.sms?.otp || '');
  const rawPhone = payload?.sms?.phone || payload?.user?.new_phone || payload?.user?.phone_change || payload?.user?.phone;
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!/^\d{4,10}$/.test(otp) || !/^7\d{10}$/.test(digits)) return fail(400, 'INVALID_PAYLOAD');
  const db = admin();
  const { data: attempt, error } = await db.from('waitcall_auth_attempts').select('id')
    .eq('phone', `+${digits}`).eq('consumed', false).not('call_number', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return fail(503, 'STORAGE_ERROR');
  if (!attempt) return fail(409, 'NO_PENDING_WAITCALL');
  const { error: writeError } = await db.from('waitcall_auth_attempts').update({ otp }).eq('id', attempt.id);
  return writeError ? fail(503, 'STORAGE_ERROR') : Response.json({});
});
