// Pure request handler; tests inject Postgres/Expo adapters without networking.
export const notificationCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-order-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMANENT = new Set(['MessageTooBig', 'MismatchSenderId', 'InvalidCredentials']);

function equalSecret(value, expected) {
  if (!value || !expected) return false;
  let difference = value.length ^ expected.length;
  for (let index = 0; index < Math.max(value.length, expected.length); index++) difference |= (value.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  return difference === 0;
}

export function createOrderNotificationWorker({ admin, authenticateStaff, workerSecret = '', enabled = false, expoAccessToken = '', fetchImpl = fetch, now = () => Date.now() }) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...notificationCors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
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
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: notificationCors });
    if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
    let authorized = equalSecret(request.headers.get('x-order-push-secret') || '', workerSecret);
    if (!authorized) {
      const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!bearer || bearer.length > 8192) return json(401, { error: 'STAFF_OR_WORKER_REQUIRED' });
      try { authorized = await authenticateStaff(bearer); }
      catch { return json(503, { error: 'AUTH_CHECK_UNAVAILABLE' }); }
    }
    if (!authorized) return json(403, { error: 'STAFF_OR_WORKER_REQUIRED' });
    if (!enabled) return json(503, { error: 'PUSH_NOT_CONFIGURED', message: 'Sending is disabled until Expo credentials and the worker are configured.' });

    let input;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return json(413, { error: 'BODY_TOO_LARGE' });
      input = raw ? JSON.parse(raw) : {};
      if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => key !== 'orderId')) return json(400, { error: 'ONLY_ORDER_ID_ALLOWED' });
      if (input.orderId !== undefined && !UUID.test(String(input.orderId))) return json(400, { error: 'INVALID_ORDER_ID' });
    } catch { return json(400, { error: 'INVALID_JSON' }); }

    let events;
    try { events = await rpc('claim_order_notifications', { p_order_id: input.orderId || null, p_limit: 1 }); }
    catch { return json(503, { error: 'OUTBOX_UNAVAILABLE' }); }
    const counts = { claimed: events?.length || 0, ticketed: 0, delivered: 0, invalidated: 0, retried: 0, failed: 0, errors: 0 };

    for (const event of events || []) {
      let leaseLost = false;
      const record = async (delivery, state, { ticketId = null, errorCode = null } = {}) => {
        const accepted = await rpc('record_order_notification_result', {
          p_outbox_id: event.id, p_lease_id: event.lease_id, p_delivery_id: delivery.id,
          p_state: state, p_ticket_id: ticketId, p_error_code: errorCode,
        });
        if (!accepted) { leaseLost = true; return; }
        if (state === 'ticketed') counts.ticketed++;
        else if (state === 'delivered') counts.delivered++;
        else if (state === 'disabled') counts.invalidated++;
        else if (state === 'retry') counts.retried++;
        else if (state === 'failed') counts.failed++;
      };
      try {
        const deliveries = event.deliveries || [];
        const receipts = deliveries.filter(item => item.state === 'ticketed');
        const pending = deliveries.filter(item => ['pending', 'retry'].includes(item.state));

        // Tickets are not a delivery confirmation. Keep polling missing receipts
        // without sending a second notification; Expo clears receipts after 24h.
        const receiptDue = [];
        for (const item of receipts) {
          if (!item.ticket_id || now() - Date.parse(item.ticket_created_at || '') >= 24 * 3600000 || !Number.isFinite(Date.parse(item.ticket_created_at || ''))) await record(item, 'failed', { errorCode: 'EXPO_RECEIPT_EXPIRED' });
          else receiptDue.push(item);
        }
        if (receiptDue.length && !leaseLost) {
          const renewed = await rpc('renew_order_notification_lease', { p_outbox_id: event.id, p_lease_id: event.lease_id });
          if (!renewed) { leaseLost = true; continue; }
          let response;
          try { response = await expo('getReceipts', { ids: receiptDue.map(item => item.ticket_id) }); }
          catch { response = null; }
          for (const item of receiptDue) {
            const receipt = response?.ok ? response.result?.data?.[item.ticket_id] : null;
            if (receipt?.status === 'ok') await record(item, 'delivered');
            else if (receipt?.status === 'error') {
              const code = receipt.details?.error || 'EXPO_RECEIPT_ERROR';
              await record(item, code === 'DeviceNotRegistered' ? 'disabled' : code === 'MessageRateExceeded' ? 'retry' : 'failed', { errorCode: code });
            } else await record(item, 'ticketed', { ticketId: item.ticket_id, errorCode: 'RECEIPT_NOT_AVAILABLE' });
            if (leaseLost) break;
          }
        }

        if (pending.length && !leaseLost) {
          // Re-read ownership/consent immediately before preparing messages.
          const currentOrder = await admin.from('orders').select('status,customer_id').eq('id', event.order_id).maybeSingle();
          if (currentOrder.error) throw new Error('WORKER_DATABASE_ERROR');
          const orderValid = currentOrder.data?.status === event.event_status && currentOrder.data?.customer_id === event.customer_id;
          const tokens = await admin.from('device_push_tokens').select('id,user_id,expo_push_token,enabled').in('id', pending.map(item => item.device_id).filter(Boolean));
          if (tokens.error) throw new Error('WORKER_DATABASE_ERROR');
          const eligible = [];
          for (const item of pending) {
            const device = tokens.data?.find(token => token.id === item.device_id);
            if (!orderValid || !device?.enabled || device.user_id !== event.customer_id || device.expo_push_token !== item.token) await record(item, 'disabled', { errorCode: orderValid ? 'OPTED_OUT_OR_ACCOUNT_CHANGED' : 'SUPERSEDED' });
            else eligible.push(item);
          }

          if (eligible.length && !leaseLost) {
            const renewed = await rpc('renew_order_notification_lease', { p_outbox_id: event.id, p_lease_id: event.lease_id });
            if (!renewed) { leaseLost = true; continue; }
            const messages = eligible.map(item => ({
              to: item.token, sound: 'default', channelId: 'orders', title: 'SBL',
              body: event.event_status === 'ready' ? `Заказ №${event.order_number} готов. Можно забирать!`
                : event.event_status === 'accepted' ? `Заказ №${event.order_number} принят. Скоро начнём готовить.`
                : event.event_status === 'preparing' ? `Заказ №${event.order_number} принят и уже готовится.`
                : `Заказ №${event.order_number} отменён. Подробности уточните в кофейне.`,
              data: { type: 'order_status', orderId: event.order_id, customerId: event.customer_id, notificationId: event.id, status: event.event_status },
            }));
            let response;
            try { response = await expo('send', messages); } catch { response = null; }
            const tickets = Array.isArray(response?.result?.data) ? response.result.data : response?.result?.data ? [response.result.data] : [];
            for (let index = 0; index < eligible.length; index++) {
              const item = eligible[index];
              const ticket = response?.ok ? tickets[index] : null;
              if (ticket?.status === 'ok' && typeof ticket.id === 'string') await record(item, 'ticketed', { ticketId: ticket.id });
              else if (ticket?.status === 'error') {
                const code = ticket.details?.error || 'EXPO_TICKET_ERROR';
                await record(item, code === 'DeviceNotRegistered' ? 'disabled' : PERMANENT.has(code) ? 'failed' : 'retry', { errorCode: code });
              } else {
                const retryable = !response || response.status === 429 || response.status === 408 || response.status >= 500 || response.ok;
                await record(item, retryable ? 'retry' : 'failed', { errorCode: response ? `EXPO_HTTP_${response.status}` : 'EXPO_NETWORK_ERROR' });
              }
              if (leaseLost) break;
            }
          }
        }
        if (!leaseLost) await rpc('finish_order_notification', { p_outbox_id: event.id, p_lease_id: event.lease_id });
      } catch {
        // Retain the lease on an unexpected database failure; another worker
        // may recover it after expiry, without an immediate duplicate send.
        counts.errors++;
      }
    }
    return json(counts.errors ? 207 : 200, { ok: counts.errors === 0, ...counts });
  };
}
