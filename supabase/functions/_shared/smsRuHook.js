// Supabase Auth "Send SMS" hook -> sms.ru. Pure handler: tests inject fetch/clock.
// Supabase signs every call (Standard Webhooks, HMAC-SHA256); unsigned or stale
// requests are refused, so nobody else can spend the sms.ru balance through this URL.
// The OTP itself is generated and checked by Supabase Auth; this code only delivers it.
// Never log the code, the api_id or the full phone number.

const TOLERANCE_SECONDS = 5 * 60;
const SMSRU_URL = 'https://sms.ru/sms/send';

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function equalText(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

// Accepts "v1,whsec_<base64>" (as shown in the Supabase dashboard) or the bare base64 part.
export async function verifyStandardWebhook({ secret, id, timestamp, signatures, body, nowSeconds }) {
  if (!secret || !id || !timestamp || !signatures) return false;
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(nowSeconds - sentAt) > TOLERANCE_SECONDS) return false;
  let keyBytes;
  try { keyBytes = base64ToBytes(String(secret).replace(/^v1,/, '').replace(/^whsec_/, '')); } catch { return false; }
  if (!keyBytes.length) return false;
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = bytesToBase64(mac);
  return String(signatures).split(' ').some(part => {
    const [version, value] = part.split(',');
    return version === 'v1' && typeof value === 'string' && equalText(value, expected);
  });
}

// Anonymous guest linking a phone (phone_change) has no user.phone yet: the target is new_phone.
export function targetPhone(user, sms) {
  const pick = sms?.phone
    || (sms?.sms_type === 'phone_change' || !user?.phone ? user?.new_phone || user?.phone_change : user?.phone)
    || '';
  const digits = String(pick).replace(/\D/g, '');
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : null;
}

export function createSmsRuHook({ apiId = '', hookSecret = '', sender = '', testMode = false, fetchImpl = fetch, now = () => Date.now() }) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  // Supabase shows this message to the client as the sign-in error.
  const fail = (status, message) => json(status, { error: { http_code: status, message } });

  return async function handle(request) {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
    if (!apiId || !hookSecret) return fail(503, 'SMS_NOT_CONFIGURED');
    const body = await request.text();
    if (body.length > 65536) return fail(413, 'BODY_TOO_LARGE');
    const signed = await verifyStandardWebhook({
      secret: hookSecret, body, nowSeconds: Math.floor(now() / 1000),
      id: request.headers.get('webhook-id'), timestamp: request.headers.get('webhook-timestamp'), signatures: request.headers.get('webhook-signature'),
    });
    if (!signed) return fail(401, 'INVALID_SIGNATURE');

    let payload;
    try { payload = JSON.parse(body); } catch { return fail(400, 'INVALID_JSON'); }
    const otp = String(payload?.sms?.otp || '');
    if (!/^\d{4,10}$/.test(otp)) return fail(400, 'INVALID_OTP');
    const phone = targetPhone(payload?.user, payload?.sms);
    if (!phone) return fail(400, 'INVALID_PHONE');

    const form = new URLSearchParams({ api_id: apiId, to: phone, msg: `Код входа SBL: ${otp}. Никому его не сообщайте.`, json: '1' });
    if (sender) form.set('from', sender);
    if (testMode) form.set('test', '1');

    let result;
    try {
      const response = await fetchImpl(SMSRU_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(4000),
      });
      result = await response.json().catch(() => null);
      if (!response.ok) result = null;
    } catch { result = null; }
    if (!result) return fail(502, 'SMS_PROVIDER_UNAVAILABLE');

    const perNumber = result.sms?.[phone];
    if (result.status === 'OK' && perNumber?.status === 'OK') return json(200, {});
    const code = Number(perNumber?.status_code || result.status_code) || 0;
    console.error('[send-sms-hook] sms.ru refused', { code, phoneTail: phone.slice(-2) });
    return fail(502, `SMS_PROVIDER_ERROR_${code}`);
  };
}
