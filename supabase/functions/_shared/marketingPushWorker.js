// Sends queued publication pushes and series reminders. Pure handler: tests inject
// Postgres/Expo adapters. Consent, devices and expiry are re-checked inside
// claim_marketing_pushes, so this code only transports what the database released.
export const marketingCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-order-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PERMANENT = new Set(['MessageTooBig', 'MismatchSenderId', 'InvalidCredentials']);
const BATCH = 50;

function equalSecret(value, expected) {
  if (!value || !expected) return false;
  let difference = value.length ^ expected.length;
  for (let index = 0; index < Math.max(value.length, expected.length); index++) difference |= (value.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  return difference === 0;
}

export function createMarketingPushWorker({ admin, authenticateStaff, workerSecret = '', enabled = false, expoAccessToken = '', fetchImpl = fetch, now = () => Date.now() }) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...marketingCors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const rpc = async (name, args) => { const { data, error } = await admin.rpc(name, args); if (error) throw new Error('WORKER_DATABASE_ERROR'); return data; };
  const expo = async (path, body) => {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;
    const response = await fetchImpl(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    let result;
    try { result = await response.json(); } catch { result = null; }
    return { ok: response.ok, status: response.status, result };
  };

  return async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: marketingCors });
    if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
    let viaSecret = equalSecret(request.headers.get('x-order-push-secret') || '', workerSecret);
    let authorized = viaSecret;
    if (!authorized) {
      const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!bearer || bearer.length > 8192) return json(401, { error: 'STAFF_OR_WORKER_REQUIRED' });
      try { authorized = await authenticateStaff(bearer); }
      catch { return json(503, { error: 'AUTH_CHECK_UNAVAILABLE' }); }
    }
    if (!authorized) return json(403, { error: 'STAFF_OR_WORKER_REQUIRED' });
    if (!enabled) return json(503, { error: 'PUSH_NOT_CONFIGURED', message: 'Sending is disabled until Expo credentials and the worker are configured.' });

    let enqueueSeries = false;
    try {
      const raw = await request.text();
      if (raw.length > 512) return json(413, { error: 'BODY_TOO_LARGE' });
      const input = raw ? JSON.parse(raw) : {};
      if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => key !== 'enqueueSeries')) return json(400, { error: 'ONLY_ENQUEUE_SERIES_ALLOWED' });
      enqueueSeries = input.enqueueSeries === true;
    } catch { return json(400, { error: 'INVALID_JSON' }); }
    // Reminders are created by the scheduled worker only, never by a staff browser.
    if (enqueueSeries && !viaSecret) return json(403, { error: 'WORKER_SECRET_REQUIRED' });

    const counts = { seriesQueued: 0, claimed: 0, ticketed: 0, delivered: 0, invalidated: 0, retried: 0, failed: 0, errors: 0 };
    try {
      if (enqueueSeries) counts.seriesQueued = Number(await rpc('enqueue_series_reminders', {})) || 0;
    } catch { return json(503, { error: 'QUEUE_UNAVAILABLE' }); }

    let rows;
    try { rows = await rpc('claim_marketing_pushes', { p_limit: BATCH }); }
    catch { return json(503, { error: 'QUEUE_UNAVAILABLE' }); }
    rows = Array.isArray(rows) ? rows : [];
    counts.claimed = rows.length;

    const record = async (row, state, { ticketId = null, errorCode = null } = {}) => {
      try {
        const accepted = await rpc('record_marketing_push_result', { p_id: row.id, p_lease_id: row.lease_id, p_state: state, p_ticket_id: ticketId, p_error_code: errorCode });
        if (!accepted) return;
        if (state === 'ticketed') counts.ticketed++;
        else if (state === 'delivered') counts.delivered++;
        else if (state === 'disabled') counts.invalidated++;
        else if (state === 'retry') counts.retried++;
        else if (state === 'failed') counts.failed++;
      } catch { counts.errors++; }
    };

    // Receipts first (tickets are not delivery confirmation; Expo keeps them 24h).
    const awaiting = rows.filter(row => row.state === 'ticketed');
    const toSend = rows.filter(row => row.state === 'processing');
    const receiptRows = [];
    for (const row of awaiting) {
      const created = Date.parse(row.ticket_created_at || '');
      if (!row.ticket_id || !Number.isFinite(created) || now() - created >= 24 * 3600000) await record(row, 'failed', { errorCode: 'EXPO_RECEIPT_EXPIRED' });
      else receiptRows.push(row);
    }
    if (receiptRows.length) {
      let response;
      try { response = await expo('getReceipts', { ids: receiptRows.map(row => row.ticket_id) }); } catch { response = null; }
      for (const row of receiptRows) {
        const receipt = response?.ok ? response.result?.data?.[row.ticket_id] : null;
        if (receipt?.status === 'ok') await record(row, 'delivered');
        else if (receipt?.status === 'error') {
          const code = receipt.details?.error || 'EXPO_RECEIPT_ERROR';
          await record(row, code === 'DeviceNotRegistered' ? 'disabled' : code === 'MessageRateExceeded' ? 'retry' : 'failed', { errorCode: code });
        } else await record(row, 'ticketed', { ticketId: row.ticket_id, errorCode: 'RECEIPT_NOT_AVAILABLE' });
      }
    }

    if (toSend.length) {
      const messages = toSend.map(row => ({
        to: row.token, sound: 'default', channelId: row.kind === 'publication' ? 'promotions' : 'series',
        title: row.title, body: row.body, data: row.data,
      }));
      let response;
      try { response = await expo('send', messages); } catch { response = null; }
      const tickets = Array.isArray(response?.result?.data) ? response.result.data : response?.result?.data ? [response.result.data] : [];
      for (let index = 0; index < toSend.length; index++) {
        const row = toSend[index];
        const ticket = response?.ok ? tickets[index] : null;
        if (ticket?.status === 'ok' && typeof ticket.id === 'string') await record(row, 'ticketed', { ticketId: ticket.id });
        else if (ticket?.status === 'error') {
          const code = ticket.details?.error || 'EXPO_TICKET_ERROR';
          await record(row, code === 'DeviceNotRegistered' ? 'disabled' : PERMANENT.has(code) ? 'failed' : 'retry', { errorCode: code });
        } else {
          const retryable = !response || response.status === 429 || response.status === 408 || response.status >= 500 || response.ok;
          await record(row, retryable ? 'retry' : 'failed', { errorCode: response ? `EXPO_HTTP_${response.status}` : 'EXPO_NETWORK_ERROR' });
        }
      }
    }
    return json(counts.errors ? 207 : 200, { ok: counts.errors === 0, ...counts });
  };
}
