// Yandex ID login: userinfo adapter shape and token handling. No network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const code = babel.transformSync(read('supabase/functions/_shared/yandexUserinfo.js'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, String, Response, AbortSignal, encodeURIComponent, fetch() { throw Error('REAL_NETWORK_FORBIDDEN'); } });
const { createYandexUserinfo, mapYandexProfile } = mod.exports;

const profile = { id: '1000034426', login: 'ivan', real_name: 'Иван Петров', first_name: 'Иван', last_name: 'Петров', default_email: 'secret@yandex.ru', default_avatar_id: '0/0-0', is_avatar_empty: false, psuid: 'x' };
const TOKEN = 'y0_AgAAAA-example-token-1234567890';

(async () => {
  const claims = mapYandexProfile(profile);
  assert.equal(claims.sub, '1000034426');
  assert.equal(claims.name, 'Иван Петров');
  assert.equal(claims.preferred_username, 'ivan');
  assert.match(claims.picture, /^https:\/\/avatars\.yandex\.net\/get-yapic\/0%2F0-0\/islands-200$/);
  assert.equal(claims.email, 'yandex-1000034426@yandex-id.invalid', 'a verified placeholder lets Supabase link the identity; the real address is never requested');
  assert.equal(claims.email_verified, true);
  assert.doesNotMatch(JSON.stringify(claims), /secret@yandex\.ru/, 'the real Yandex email is never forwarded');
  assert.equal(mapYandexProfile({ login: 'no-id' }), null, 'no id means no account');
  assert.equal(mapYandexProfile({ id: 7, login: 'only' }).name, 'only');

  const calls = [];
  const handle = createYandexUserinfo({ fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => profile }; } });
  let res = await handle(new Request('https://x.test/', { headers: { Authorization: `Bearer ${TOKEN}` } }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).sub, '1000034426');
  assert.equal(calls[0].url, 'https://login.yandex.ru/info?format=json');
  assert.equal(calls[0].init.headers.Authorization, `OAuth ${TOKEN}`);

  assert.equal((await handle(new Request('https://x.test/'))).status, 401);
  assert.equal((await handle(new Request('https://x.test/', { headers: { Authorization: 'Bearer short' } }))).status, 401);
  assert.equal((await handle(new Request('https://x.test/', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }))).status, 405);
  assert.equal(calls.length, 1, 'bad requests never reach Yandex');

  res = await createYandexUserinfo({ fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) })(new Request('https://x.test/', { headers: { Authorization: `Bearer ${TOKEN}` } }));
  assert.equal(res.status, 401);
  res = await createYandexUserinfo({ fetchImpl: async () => { throw Error('net'); } })(new Request('https://x.test/', { headers: { Authorization: `Bearer ${TOKEN}` } }));
  assert.equal(res.status, 502);
  res = await createYandexUserinfo({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ login: 'x' }) }) })(new Request('https://x.test/', { headers: { Authorization: `Bearer ${TOKEN}` } }));
  assert.equal(res.status, 502);

  const source = read('supabase/functions/_shared/yandexUserinfo.js');
  assert.doesNotMatch(source, /console\./, 'token and profile are never logged');
  assert.doesNotMatch(source + read('supabase/functions/yandex-userinfo/index.ts'), /client_secret|[0-9a-f]{32}/i, 'no client secret in the function');
  console.log('PASS: Yandex userinfo adapter maps id->sub, forwards token as OAuth, refuses bad tokens, logs nothing');
})().catch(error => { console.error(error); process.exit(1); });
