const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load(file, mocks = {}) {
  const code = babel.transformSync(read(file), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => { if (!(name in mocks)) throw Error(`Missing mock ${name}`); return mocks[name]; },
    process: { env: {} }, console, Date, Error, Request, Response, AbortSignal, JSON, Number, Array, Math, Set, URLSearchParams, fetch() { throw Error('REAL_NETWORK_FORBIDDEN'); },
  }, { filename: file });
  return module.exports;
}

// --- migration: consent defaults, worker-only RPCs, stale-send protection ---
const sql = read('supabase/migrations/20261110100000_push_campaigns.sql');
assert.match(sql, /promotions boolean NOT NULL DEFAULT false/);
assert.match(sql, /series_reminders boolean NOT NULL DEFAULT false/);
// The kassa goes new -> preparing directly, so "preparing" must also notify.
assert.match(sql, /event_status IN \('accepted', 'preparing', 'ready', 'cancelled'\)/);
assert.match(sql, /NEW\.status NOT IN \('accepted', 'preparing', 'ready', 'cancelled'\)/);
assert.doesNotMatch(sql, /IMMUTABLE/, 'time-zone functions are STABLE, not IMMUTABLE');
// Rate limit counts delivery time, under a global lock.
assert.match(sql, /deliver_from timestamptz NOT NULL/);
assert.match(sql, /publication-push:rate[\s\S]*deliver_from > v_start - interval '1 hour'[\s\S]*PUSH_RATE_LIMIT/);
// A re-armed superseded status drops its old per-device rows so it is really sent again.
assert.match(sql, /DELETE FROM public\.order_notification_deliveries d USING public\.order_notification_outbox n[\s\S]*n\.state = 'superseded'/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.enqueue_series_reminders\(\) TO service_role/);
assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.(claim_marketing_pushes|record_marketing_push_result|enqueue_series_reminders)[^;]*TO[^;]*(authenticated|anon)/);
assert.match(sql, /REVOKE ALL ON public\.marketing_push_queue FROM PUBLIC, anon, authenticated/);
assert.match(sql, /staff_send_publication_push[\s\S]*STAFF_REQUIRED[\s\S]*PUBLICATION_PUSH_ALREADY_SENT/);
assert.match(sql, /JOIN public\.push_preferences p ON p\.user_id = t\.user_id AND p\.promotions/);
assert.match(sql, /JOIN public\.push_preferences p ON p\.user_id = r\.customer_id AND p\.series_reminders/);
assert.match(sql, /NOT BETWEEN 15 AND 18/);
assert.match(sql, /CONSENT_WITHDRAWN/);
assert.match(sql, /shop_is_open[\s\S]*BETWEEN 11 AND 19/);
assert.match(sql, /v_open AND state IN \('pending', 'retry'\)/);
assert.match(sql, /v_open AND state = 'processing' AND leased_until < now\(\) AND attempts < 5/);
assert.match(sql, /state = 'processing' AND q\.leased_until < now\(\)\)\) AND \(\s*q\.expires_at <= now\(\)/);
assert.match(sql, /PUSH_RATE_LIMIT/);
assert.match(sql, /IF v_count > 0 THEN\s+INSERT INTO public\.publication_push_sends/);
assert.match(sql, /staff_send_publication_push\(uuid\) TO authenticated;/);
assert.match(sql, /least\(now\(\) \+ interval '3 hours', public\.shop_window_end\(now\(\)\)\)/);
assert.match(sql, /ORDER_PLACED/);
assert.match(sql, /WHERE public\.order_notification_outbox\.state = 'superseded'/);
assert.doesNotMatch(sql, /\bnet\.http|http_post|pg_net/i);
console.log('PASS: push migration keeps consent opt-in, service-only RPCs and no database-side HTTP');

// --- worker ---
const { createMarketingPushWorker } = load('supabase/functions/_shared/marketingPushWorker.js');
const SECRET = 'worker-secret-value';
function makeWorld(rows, { enabled = true, expo } = {}) {
  const calls = [];
  const recorded = [];
  const admin = { rpc: async (name, args) => {
    calls.push(name);
    if (name === 'enqueue_series_reminders') return { data: 3, error: null }.data;
    if (name === 'enqueue_return_reminders') return 1;
    if (name === 'claim_marketing_pushes') return rows;
    if (name === 'record_marketing_push_result') { recorded.push(args); return true; }
    throw Error('UNEXPECTED_RPC ' + name);
  } };
  // The worker destructures { data, error }; wrap the plain values accordingly.
  const wrapped = { rpc: async (name, args) => ({ data: await admin.rpc(name, args), error: null }) };
  const sent = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url, body });
    if (url.endsWith('/send')) return { ok: true, status: 200, json: async () => ({ data: expo ? expo(body) : body.map((_, i) => ({ status: 'ok', id: `T${i}` })) }) };
    return { ok: true, status: 200, json: async () => ({ data: Object.fromEntries(body.ids.map(id => [id, { status: 'ok' }])) }) };
  };
  const handle = createMarketingPushWorker({ admin: wrapped, enabled, workerSecret: SECRET, fetchImpl, authenticateStaff: async token => token === 'staff-jwt', now: () => Date.parse('2026-11-10T12:00:00Z') });
  return { handle, calls, recorded, sent };
}
const post = (body, headers = {}) => new Request('https://x.test/', { method: 'POST', headers, body: JSON.stringify(body) });
const row = (id, kind, extra = {}) => ({ id, lease_id: 'L' + id, kind, user_id: 'u' + id, token: `ExpoPushToken[tok${id}aaaaaaaaaaaa]`, title: 'T', body: 'B', data: { type: kind === 'publication' ? 'publication' : 'series_reminder', userId: 'u' + id }, state: 'processing', ...extra });

(async () => {
  let w = makeWorld([]);
  assert.equal((await w.handle(post({}))).status, 401);
  assert.equal((await w.handle(post({}, { authorization: 'Bearer nope' }))).status, 403);
  w = makeWorld([], { enabled: false });
  assert.equal((await w.handle(post({}, { 'x-order-push-secret': SECRET }))).status, 503);
  assert.deepEqual(w.calls, [], 'disabled worker must not touch the queue');
  // staff cannot create reminders, only the scheduled secret can
  w = makeWorld([]);
  assert.equal((await w.handle(post({ enqueueSeries: true }, { authorization: 'Bearer staff-jwt' }))).status, 403);
  assert.equal((await w.handle(post({ enqueueReturn: true }, { authorization: 'Bearer staff-jwt' }))).status, 403);
  assert.equal((await w.handle(post({ other: 1 }, { 'x-order-push-secret': SECRET }))).status, 400);
  // scheduled run: queue series, send publication + reminder with the right Android channels
  w = makeWorld([row('1', 'publication'), row('2', 'series_reminder')]);
  let res = await w.handle(post({ enqueueSeries: true }, { 'x-order-push-secret': SECRET }));
  let out = await res.json();
  assert.equal(res.status, 200); assert.equal(out.seriesQueued, 3); assert.equal(out.ticketed, 2);
  assert.deepEqual(w.sent[0].body.map(m => m.channelId), ['promotions', 'series']);
  assert.deepEqual(w.recorded.map(r => r.p_state), ['ticketed', 'ticketed']);
  w = makeWorld([row('3', 'return_reminder', { data: { type: 'return_reminder', userId: 'u3' } })]);
  res = await w.handle(post({ enqueueReturn: true }, { 'x-order-push-secret': SECRET }));
  out = await res.json();
  assert.equal(out.returnQueued, 1);
  assert.equal(out.ticketed, 1);
  assert.deepEqual(w.calls, ['enqueue_return_reminders', 'claim_marketing_pushes', 'record_marketing_push_result']);
  assert.equal(w.sent[0].body[0].channelId, 'promotions');
  assert.equal(w.sent[0].body[0].data.type, 'return_reminder');
  // receipts: delivered / expired; tickets are never re-sent
  w = makeWorld([row('3', 'publication', { state: 'ticketed', ticket_id: 'R1', ticket_created_at: '2026-11-10T11:00:00Z' }), row('4', 'publication', { state: 'ticketed', ticket_id: 'R2', ticket_created_at: '2026-11-09T11:00:00Z' })]);
  res = await w.handle(post({}, { authorization: 'Bearer staff-jwt' })); out = await res.json();
  assert.equal(out.delivered, 1); assert.equal(out.failed, 1);
  assert.equal(w.sent.filter(s => s.url.endsWith('/send')).length, 0, 'tickets must never be re-sent');
  // Expo ticket errors: dead device is switched off, bad credentials fail, rate limit retries
  w = makeWorld([row('5', 'publication'), row('6', 'publication'), row('7', 'publication')], { expo: () => [
    { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'InvalidCredentials' } }, { status: 'error', details: { error: 'MessageRateExceeded' } } ] });
  await w.handle(post({}, { 'x-order-push-secret': SECRET }));
  assert.deepEqual(w.recorded.map(r => r.p_state), ['disabled', 'failed', 'retry']);
  console.log('PASS: marketing worker auth, staff cannot enqueue reminders, channels, receipts and ticket errors');

  // --- client service ---
  const store = {};
  const rpcs = [];
  const service = load('lib/notificationService.js', {
    'react-native': { Platform: { OS: 'ios' } },
    '@react-native-async-storage/async-storage': { getItem: async k => (k in store ? store[k] : null), setItem: async (k, v) => { store[k] = v; } },
    'expo-notifications': {}, 'expo-constants': {}, 'expo-crypto': { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' },
    './supabaseClient': { supabase: { auth: {}, rpc: async (name, args) => { rpcs.push([name, args]); return { data: name === 'get_push_preferences' ? { promotions: true, series_reminders: false } : { promotions: args.p_promotions, series_reminders: args.p_series_reminders }, error: null }; } } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await service.getPushPreferences())), { promotions: true, seriesReminders: false });
  assert.deepEqual(JSON.parse(JSON.stringify(await service.setPushPreferences({ promotions: true, seriesReminders: true }))), { promotions: true, seriesReminders: true });
  assert.deepEqual(JSON.parse(JSON.stringify(rpcs[1])), ['set_push_preferences', { p_promotions: true, p_series_reminders: true }]);
  const DAY = 24 * 3600000, t0 = 1800000000000;
  assert.equal(await service.shouldShowPushPrompt('u1', t0), true);
  await service.markPushPrompt('u1', { nowMs: t0 });
  assert.equal(await service.shouldShowPushPrompt('u1', t0 + DAY), false, 'must wait 7 days after "not now"');
  assert.equal(await service.shouldShowPushPrompt('u1', t0 + 8 * DAY), true);
  await service.markPushPrompt('u1', { nowMs: t0 + 8 * DAY });
  await service.markPushPrompt('u1', { nowMs: t0 + 16 * DAY });
  assert.equal(await service.shouldShowPushPrompt('u1', t0 + 30 * DAY), false, 'at most three asks');
  assert.equal(await service.shouldShowPushPrompt('u2', t0), true, 'another account is asked independently');
  await service.markPushPrompt('u2', { done: true, nowMs: t0 });
  assert.equal(await service.shouldShowPushPrompt('u2', t0 + 60 * DAY), false, 'a system answer ends the prompts');
  console.log('PASS: consent preferences RPC contract and prompt cadence (7 days, max 3, system answer is final)');

  // --- UI wiring ---
  for (const file of ['components/NotificationPrompt.js', 'screens/NotificationSettingsScreen.js', 'App.js'])
    babel.transformSync(read(file), { filename: path.join(root, file), babelrc: false, configFile: false, presets: [require.resolve('babel-preset-expo', { paths: [path.dirname(require.resolve('expo/package.json'))] })] });
  const app = read('App.js');
  assert.match(app, /launchDone && account && authUserId && !orderComplete && <NotificationPrompt userId=\{authUserId\} blocked=\{/);
  assert.match(app, /blocked=\{!!\(loyalty\.celebratingReward \|\| pendingProductId \|\| linkNotice/);
  const settingsScreen = read('screens/NotificationSettingsScreen.js');
  assert.match(settingsScreen, /const \[prefs, setPrefs\] = useState\(/, 'preferences state must be declared');
  assert.match(settingsScreen, /setPrefs\(await getPushPreferences\(\)\)/, 'server preferences are loaded');
  assert.match(read('supabase/functions/_shared/orderNotificationWorker.js'), /event_status === 'preparing'/);
  const prompt = read('components/NotificationPrompt.js');
  assert.ok(prompt.indexOf('enableOrderNotifications()') < prompt.indexOf('setPushPreferences('), 'categories are saved only after the system permission is granted');
  assert.match(prompt, /Не сейчас/);
  assert.match(prompt, /useState\(false\);\s*const \[series, setSeries\] = useState\(false\)/, 'optional categories are opt-in');
  assert.match(prompt, /try \{ await markPushPrompt\(userId\); \}\s*finally \{ setBusy\(false\); setVisible\(false\); \}/, '\"not now\" persists before hiding');
  assert.doesNotMatch(prompt, /rgba\(/);
  const kassa = read('kassa-terminal/content-admin.js');
  assert.match(kassa, /staff_send_publication_push/);
  assert.match(kassa, /Повторно по этой публикации отправить нельзя/);
  assert.match(kassa, /PUSH_RATE_LIMIT/); assert.match(kassa, /ENDS_BEFORE_OPENING/);
  console.log('PASS: consent sheet is gated by login/launch, asks system permission first, kassa push requires confirmation');
})().catch(error => { console.error(error); process.exit(1); });
