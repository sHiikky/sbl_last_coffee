// sms.ru Send SMS hook: signature, phone choice, request shape and errors. No network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const code = babel.transformSync(read('supabase/functions/_shared/smsRuHook.js'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
const mod = { exports: {} };
vm.runInNewContext(code, {
  module: mod, exports: mod.exports, console: { error() {} }, crypto: globalThis.crypto, TextEncoder, atob, btoa, Uint8Array, Number, String, JSON, Math,
  Response, Request, URLSearchParams, AbortSignal, fetch() { throw Error('REAL_NETWORK_FORBIDDEN'); },
});
const { createSmsRuHook, targetPhone } = mod.exports;

const KEY = Buffer.from('test-hook-key-0123456789abcdef').toString('base64');
const SECRET = `v1,whsec_${KEY}`;
const NOW = Date.parse('2026-11-17T08:00:00Z');
function signed(payload, { secret = KEY, ts = Math.floor(NOW / 1000), id = 'msg_1' } = {}) {
  const body = JSON.stringify(payload);
  const sig = nodeCrypto.createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return new Request('https://x.test/', { method: 'POST', body, headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` } });
}
function world(reply = to => ({ status: 'OK', status_code: 100, sms: { [to]: { status: 'OK', status_code: 100, sms_id: '1' } } }), options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const form = new URLSearchParams(init.body);
    calls.push({ url, form });
    return { ok: true, status: 200, json: async () => reply(form.get('to')) };
  };
  return { calls, handle: createSmsRuHook({ apiId: 'API-ID', hookSecret: SECRET, fetchImpl, now: () => NOW, ...options }) };
}
const login = { user: { id: 'u1', phone: '79991234567' }, sms: { otp: '123456' } };
const link = { user: { id: 'u2', phone: '', new_phone: '79990001122', is_anonymous: true }, sms: { otp: '654321' } };

(async () => {
  // phone selection
  assert.equal(targetPhone(login.user, login.sms), '79991234567');
  assert.equal(targetPhone(link.user, link.sms), '79990001122', 'anonymous guest linking a phone gets the code on new_phone');
  assert.equal(targetPhone({ phone: '79991234567', new_phone: '79990001122' }, { sms_type: 'phone_change' }), '79990001122');
  assert.equal(targetPhone({ phone: '+7 (999) 123-45-67' }, {}), '79991234567');
  assert.equal(targetPhone({ phone: '123' }, {}), null);

  // success: exact sms.ru request, no test flag by default
  let w = world();
  let res = await w.handle(signed(login));
  assert.equal(res.status, 200);
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].url, 'https://sms.ru/sms/send');
  assert.equal(w.calls[0].form.get('api_id'), 'API-ID');
  assert.equal(w.calls[0].form.get('to'), '79991234567');
  assert.equal(w.calls[0].form.get('json'), '1');
  assert.match(w.calls[0].form.get('msg'), /^Код входа SBL: 123456\./);
  assert.equal(w.calls[0].form.get('test'), null);
  assert.equal(w.calls[0].form.get('from'), null);
  w = world(undefined, { testMode: true, sender: 'SBL' });
  await w.handle(signed(link));
  assert.equal(w.calls[0].form.get('to'), '79990001122');
  assert.equal(w.calls[0].form.get('test'), '1');
  assert.equal(w.calls[0].form.get('from'), 'SBL');
  console.log('PASS: sms.ru request shape, test mode, sender and phone_change target');

  // signature: wrong key, stale timestamp, tampered body, missing headers, unconfigured
  w = world();
  assert.equal((await w.handle(signed(login, { secret: Buffer.from('other-key').toString('base64') }))).status, 401);
  assert.equal((await w.handle(signed(login, { ts: Math.floor(NOW / 1000) - 600 }))).status, 401);
  const good = signed(login);
  const tampered = new Request('https://x.test/', { method: 'POST', headers: good.headers, body: JSON.stringify({ ...login, user: { phone: '79000000000' } }) });
  assert.equal((await w.handle(tampered)).status, 401);
  assert.equal((await w.handle(new Request('https://x.test/', { method: 'POST', body: JSON.stringify(login) }))).status, 401);
  assert.equal(w.calls.length, 0, 'unsigned requests never reach sms.ru');
  assert.equal((await createSmsRuHook({ apiId: '', hookSecret: SECRET })(signed(login))).status, 503);
  console.log('PASS: only correctly signed, fresh Supabase calls can send SMS');

  // provider errors are reported to Auth, not swallowed
  w = world(() => ({ status: 'ERROR', status_code: 201, status_text: 'Не хватает средств' }));
  res = await w.handle(signed(login)); let out = await res.json();
  assert.equal(res.status, 502); assert.equal(out.error.message, 'SMS_PROVIDER_ERROR_201');
  w = world(to => ({ status: 'OK', sms: { [to]: { status: 'ERROR', status_code: 207 } } }));
  out = await (await w.handle(signed(login))).json();
  assert.equal(out.error.message, 'SMS_PROVIDER_ERROR_207');
  const broken = createSmsRuHook({ apiId: 'A', hookSecret: SECRET, now: () => NOW, fetchImpl: async () => { throw Error('net'); } });
  assert.equal((await broken(signed(login))).status, 502);
  w = world();
  assert.equal((await w.handle(signed({ user: login.user, sms: { otp: 'abc' } }))).status, 400);
  assert.equal((await w.handle(signed({ user: { phone: '' }, sms: { otp: '123456' } }))).status, 400);

  // the code never leaks into logs and the key never lives in the repository
  const source = read('supabase/functions/_shared/smsRuHook.js') + read('supabase/functions/send-sms-hook/index.ts');
  assert.doesNotMatch(source, /console\.\w+\([^)]*otp/i);
  assert.doesNotMatch(source, /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, 'api_id must be a Supabase secret, not source code');
  const config = read('supabase/config.toml');
  assert.match(config, /\[auth\.hook\.send_sms\][\s\S]*secrets = "env\(SEND_SMS_HOOK_SECRET\)"/);
  assert.match(config, /\[functions\.send-sms-hook\]\s*enabled = true\s*verify_jwt = false/);
  console.log('PASS: sms.ru errors surface to Auth, invalid code/phone rejected, no secrets or codes in source/logs');
})().catch(error => { console.error(error); process.exit(1); });
