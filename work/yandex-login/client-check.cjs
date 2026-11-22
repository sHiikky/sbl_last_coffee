// Yandex ID sign-in in lib/accountService.js: account projection, OAuth round trip, link/sign-in
// fallback, cancellation. Fake Supabase client and browser; no network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');

function load(file, mocks = {}) {
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Error, Object, String, Array, Number, Map, Promise, JSON, Date, Math, decodeURIComponent,
    process: { env: { EXPO_PUBLIC_YANDEX_AUTH_ENABLED: 'true' } },
    require: name => { if (!(name in mocks)) throw Error(`Missing mock ${name}`); return mocks[name]; },
  });
  return module.exports;
}

const account = load('lib/accountService.js', {
  './supabaseClient': { supabase: {}, ensureAnonymousSession: async () => {} },
  './notificationService': { unregisterCurrentPushToken: async () => {} },
  './yandexAuthBrowser': { YANDEX_REDIRECT_URL: 'sbl://auth/yandex', openYandexAuthSession: async () => ({ type: 'cancel' }) },
});

const GUEST = { id: 'guest-1', is_anonymous: true };
const YANDEX_USER = {
  id: 'guest-1', is_anonymous: false, phone: '', phone_confirmed_at: null,
  app_metadata: { provider: 'custom:yandex-id', providers: ['custom:yandex-id'] },
  identities: [{ provider: 'custom:yandex-id' }], user_metadata: { name: 'Иван Петров', preferred_username: 'ivan' },
};
const REDIRECT = 'sbl://auth/yandex';

function fakeClient({ link = {}, signin = {}, exchange = {}, user = GUEST } = {}) {
  const log = [];
  let current = user;
  return {
    log,
    auth: {
      getUser: async () => ({ data: { user: current }, error: null }),
      linkIdentity: async args => { log.push(['link', args.provider, args.options]); return link.error ? { data: null, error: link.error } : { data: { url: 'https://x.supabase.co/auth/v1/authorize?provider=custom%3Ayandex-id&mode=link' }, error: null }; },
      signInWithOAuth: async args => { log.push(['signin', args.provider, args.options]); return signin.error ? { data: null, error: signin.error } : { data: { url: 'https://x.supabase.co/auth/v1/authorize?provider=custom%3Ayandex-id&mode=signin' }, error: null }; },
      exchangeCodeForSession: async code => { log.push(['exchange', code]); if (exchange.error) return { data: null, error: exchange.error }; current = exchange.user || YANDEX_USER; return { data: { session: { user: current }, user: current }, error: null }; },
    },
  };
}
const service = (client, opts = {}) => account.createAccountService({
  client, ensureSession: async () => {}, yandexEnabled: true, yandexRedirectTo: REDIRECT, removePushToken: async args => client.log.push(['revoke', args.userId]), ...opts,
});
const browser = (...results) => { const calls = []; return { calls, open: async (url, redirect) => { calls.push([url, redirect]); return results.shift(); } }; };

(async () => {
  // account projection
  assert.equal(account.getVerifiedAccount(GUEST), null);
  assert.equal(account.getVerifiedAccount({ ...YANDEX_USER, is_anonymous: true }), null, 'an anonymous user is never an account');
  assert.deepEqual({ ...account.getVerifiedAccount(YANDEX_USER) }, { id: 'guest-1', phone: null, provider: 'yandex', name: 'Иван Петров' });
  assert.equal(account.getVerifiedAccount({ id: 'u', is_anonymous: false, app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }] }), null, 'other providers are not accounts');
  assert.equal(account.getVerifiedAccount({ user: { ...YANDEX_USER, user_metadata: {} } }).name, null);
  const linkedOnly = { id: 'u', is_anonymous: false, phone: '79991234567', phone_confirmed_at: '2026-11-22T00:00:00Z', app_metadata: { providers: ['phone', 'custom:yandex-id'] }, user_metadata: { sub: 'x' }, identities: [{ provider: 'phone', identity_data: {} }, { provider: 'custom:yandex-id', identity_data: { name: 'Иван Петров' } }] };
  assert.equal(account.getVerifiedAccount(linkedOnly).name, 'Иван Петров', 'the name comes from the Yandex identity when user_metadata lacks it');
  const both = account.getVerifiedAccount({ ...YANDEX_USER, phone: '+79991234567', phone_confirmed_at: '2026-11-22T00:00:00Z' });
  assert.equal(both.phone, '+79991234567', 'a confirmed phone still wins when both exist');
  console.log('PASS: Yandex identity makes an account without a phone; anonymous and other providers do not');

  // callback parsing
  assert.deepEqual({ ...account.parseAuthCallback('sbl://auth/yandex?code=abc123') }, { code: 'abc123', error: '', errorCode: '', description: '' });
  const failed = account.parseAuthCallback('sbl://auth/yandex?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked');
  assert.equal(failed.errorCode, 'identity_already_exists'); assert.equal(failed.description, 'Identity is already linked');
  assert.equal(account.parseAuthCallback('sbl://auth/yandex#access_token=SECRET&refresh_token=X').code, '', 'tokens in a hash are never treated as a code');
  assert.equal(account.parseAuthCallback('').code, '');
  console.log('PASS: callback parser reads only code/error fields');

  // happy path: guest keeps the uid via linkIdentity
  let client = fakeClient(); let b = browser({ type: 'success', url: `${REDIRECT}?code=pkce-code` });
  let result = await service(client, { openAuthSession: b.open }).startYandexSignIn();
  assert.equal(result.provider, 'yandex'); assert.equal(result.id, 'guest-1');
  assert.deepEqual(client.log.map(entry => entry[0]), ['link', 'exchange']);
  assert.equal(client.log[0][1], 'custom:yandex-id'); assert.equal(client.log[0][2].skipBrowserRedirect, true); assert.equal(client.log[0][2].redirectTo, REDIRECT);
  assert.equal(client.log[1][1], 'pkce-code');
  assert.equal(b.calls[0][1], REDIRECT);
  console.log('PASS: link keeps the guest uid and exchanges the PKCE code');

  // Yandex ID already belongs to another account -> plain sign-in, guest push registration dropped first
  client = fakeClient({ exchange: { user: { ...YANDEX_USER, id: 'existing-9' } } });
  b = browser({ type: 'success', url: `${REDIRECT}?error=server_error&error_code=identity_already_exists` }, { type: 'success', url: `${REDIRECT}?code=second` });
  result = await service(client, { openAuthSession: b.open }).startYandexSignIn();
  assert.equal(result.id, 'existing-9');
  assert.deepEqual(client.log.map(entry => entry[0]), ['link', 'revoke', 'signin', 'exchange']);
  assert.equal(client.log[1][1], 'guest-1');
  assert.equal(client.log[3][1], 'second');
  console.log('PASS: an already-registered Yandex ID signs in to its account after revoking the guest push token');

  // manual linking disabled at link time -> fall back to sign-in
  client = fakeClient({ link: { error: { code: 'manual_linking_disabled' } } }); b = browser({ type: 'success', url: `${REDIRECT}?code=c` });
  result = await service(client, { openAuthSession: b.open }).startYandexSignIn();
  assert.equal(result.provider, 'yandex'); assert.deepEqual(client.log.map(entry => entry[0]), ['link', 'revoke', 'signin', 'exchange']);

  // refusals
  await assert.rejects(() => service(fakeClient(), { yandexEnabled: false }).startYandexSignIn(), { code: 'YANDEX_AUTH_DISABLED' });
  b = browser({ type: 'cancel' });
  await assert.rejects(() => service(fakeClient(), { openAuthSession: b.open }).startYandexSignIn(), { code: 'YANDEX_CANCELLED' });
  b = browser({ type: 'success', url: `${REDIRECT}?error=access_denied&error_description=denied` });
  await assert.rejects(() => service(fakeClient(), { openAuthSession: b.open }).startYandexSignIn(), { code: 'YANDEX_CANCELLED' });
  b = browser({ type: 'success', url: REDIRECT });
  await assert.rejects(() => service(fakeClient(), { openAuthSession: b.open }).startYandexSignIn(), { code: 'YANDEX_UNAVAILABLE' });
  client = fakeClient({ link: { error: { code: 'provider_disabled' } } }); b = browser();
  await assert.rejects(() => service(client, { openAuthSession: b.open }).startYandexSignIn(), { code: 'YANDEX_UNAVAILABLE' });
  assert.equal(b.calls.length, 0, 'the browser never opens without an authorize URL');
  await assert.rejects(() => service(fakeClient({ user: YANDEX_USER }), { openAuthSession: browser().open }).startYandexSignIn(), { code: 'ALREADY_SIGNED_IN' });
  await assert.rejects(() => service(fakeClient({ user: { id: 'x', is_anonymous: false } }), { openAuthSession: browser().open }).startYandexSignIn(), { code: 'SESSION_CHANGED' });
  await assert.rejects(() => service(fakeClient({ exchange: { error: { code: 'flow_state_not_found', message: 'bad' } } }), { openAuthSession: browser({ type: 'success', url: `${REDIRECT}?code=z` }).open }).startYandexSignIn(), { code: 'flow_state_not_found' });
  console.log('PASS: disabled, cancelled, denied, empty callback, unavailable provider, signed-in and expired-code cases refuse safely');

  // a second tap while the first is running is ignored
  let release; const slow = { open: () => new Promise(resolve => { release = () => resolve({ type: 'cancel' }); }) };
  const busy = service(fakeClient(), { openAuthSession: slow.open });
  const first = busy.startYandexSignIn();
  await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(() => busy.startYandexSignIn(), { code: 'REQUEST_IN_PROGRESS' });
  release(); await assert.rejects(() => first, { code: 'YANDEX_CANCELLED' });
  const again = busy.startYandexSignIn();
  await new Promise(resolve => setTimeout(resolve, 0));
  release(); await assert.rejects(() => again, { code: 'YANDEX_CANCELLED' }); // guard released after the first finished
  console.log('PASS: concurrent taps are refused and the guard is released afterwards');

  // A phone account attaches Yandex to itself; a taken Yandex ID is never merged
  const ownPhone = { id: 'phone-1', is_anonymous: false, phone: '79991234567', phone_confirmed_at: '2026-11-22T00:00:00Z', app_metadata: { provider: 'phone', providers: ['phone'] }, user_metadata: {} };
  const attached = { ...ownPhone, app_metadata: { provider: 'phone', providers: ['phone', 'custom:yandex-id'] }, identities: [{ provider: 'custom:yandex-id' }], user_metadata: { name: 'Иван Петров' } };
  client = fakeClient({ user: ownPhone, exchange: { user: attached } }); b = browser({ type: 'success', url: `${REDIRECT}?code=attach` });
  result = await service(client, { openAuthSession: b.open }).startYandexSignIn();
  assert.deepEqual({ ...result }, { id: 'phone-1', phone: '+79991234567', provider: 'yandex', name: 'Иван Петров' });
  assert.deepEqual(client.log.map(entry => entry[0]), ['link', 'exchange'], 'attach uses link only, never a second sign-in');
  client = fakeClient({ user: ownPhone }); b = browser({ type: 'success', url: `${REDIRECT}?error=server_error&error_code=identity_already_exists` });
  await assert.rejects(() => service(client, { openAuthSession: b.open }).startYandexSignIn(), { code: 'YANDEX_TAKEN' });
  assert.deepEqual(client.log.map(entry => entry[0]), ['link'], 'a taken Yandex ID: no push revoke, no account switch');
  client = fakeClient({ user: ownPhone, link: { error: { code: 'manual_linking_disabled' } } });
  await assert.rejects(() => service(client, { openAuthSession: browser().open }).startYandexSignIn(), { code: 'YANDEX_UNAVAILABLE' });
  console.log('PASS: a phone account attaches Yandex to itself; a Yandex ID owned by another account is refused without merging or switching');

  // Yandex account adds a call-confirmed phone to ITSELF
  const PHONE = '+79991234567';
  const phoneUser = { ...YANDEX_USER, phone: '79991234567', phone_confirmed_at: '2026-11-22T00:00:00Z' };
  function linkClient({ user = YANDEX_USER, startResult = { attemptId: 'att-1', callNumber: '+78001234567', expiresIn: 900 }, updateError = null, complete = { ok: true, accessToken: 'a', refreshToken: 'r' }, finalUser = phoneUser } = {}) {
    const log = [];
    let current = user;
    return {
      log,
      functions: { invoke: async (name, args) => { log.push(['invoke', name, args.body && Object.keys(args.body).sort().join(',')]); if (name === 'start-waitcall') return { data: startResult, error: null }; return { data: complete, error: null }; } },
      auth: {
        getUser: async () => ({ data: { user: current }, error: null }),
        updateUser: async args => { log.push(['updateUser', args.phone]); return { data: {}, error: updateError }; },
        setSession: async tokens => { log.push(['setSession', tokens.access_token]); current = finalUser; return { data: { user: finalUser, session: { user: finalUser } }, error: null }; },
      },
    };
  }
  const linkService = client => account.createAccountService({ client, ensureSession: async () => {}, enabled: true, removePushToken: async () => client.log.push(['revoke']) });

  let lc = linkClient();
  let svc = linkService(lc);
  const challenge = await svc.startPhoneLink('+7 (999) 123-45-67');
  assert.equal(challenge.link, true); assert.equal(challenge.mode, 'phone_change'); assert.equal(challenge.previousUserId, 'guest-1'); assert.equal(challenge.callNumber, '+78001234567');
  assert.deepEqual(lc.log.map(entry => entry[0]), ['invoke', 'updateUser']);
  assert.equal(lc.log[1][1], PHONE);
  const linked = await svc.checkWaitCallSignIn(challenge);
  assert.deepEqual({ ...linked }, { id: 'guest-1', phone: PHONE, provider: 'yandex', name: 'Иван Петров' }, 'same uid keeps Yandex and gains the verified phone');
  assert.ok(!lc.log.some(entry => entry[0] === 'revoke'), 'linking keeps the same user, so the push registration is not dropped');

  // pending call: nothing changes yet
  lc = linkClient({ complete: { ok: false, pending: true } });
  assert.equal(await linkService(lc).checkWaitCallSignIn({ ...challenge }), null);
  assert.ok(!lc.log.some(entry => entry[0] === 'setSession'));

  // a phone that belongs to another account is refused, not merged
  await assert.rejects(() => linkService(linkClient({ updateError: { code: 'phone_exists' } })).startPhoneLink(PHONE), { code: 'PHONE_EXISTS' });
  // guests, phone-only accounts and already-confirmed Yandex accounts cannot use the link path
  await assert.rejects(() => linkService(linkClient({ user: GUEST })).startPhoneLink(PHONE), { code: 'SESSION_CHANGED' });
  await assert.rejects(() => linkService(linkClient({ user: { id: 'p', is_anonymous: false, phone: '79991234567', phone_confirmed_at: 'x' } })).startPhoneLink(PHONE), { code: 'SESSION_CHANGED' });
  await assert.rejects(() => linkService(linkClient({ user: phoneUser })).startPhoneLink(PHONE), { code: 'SESSION_CHANGED' });
  // an invalid number never reaches the server
  lc = linkClient(); await assert.rejects(() => linkService(lc).startPhoneLink('123'), { code: 'INVALID_PHONE' }); assert.equal(lc.log.length, 0);
  // the session changed under the challenge, or the server returned another user/phone
  lc = linkClient({ user: { ...YANDEX_USER, id: 'someone-else' } });
  await assert.rejects(() => linkService(lc).checkWaitCallSignIn(challenge), { code: 'SESSION_CHANGED' });
  lc = linkClient({ finalUser: { ...phoneUser, phone: '79990000000' } });
  await assert.rejects(() => linkService(lc).checkWaitCallSignIn(challenge), { code: 'PHONE_NOT_CONFIRMED' });
  lc = linkClient({ finalUser: { ...phoneUser, id: 'different-uid' } });
  await assert.rejects(() => linkService(lc).checkWaitCallSignIn(challenge), { code: 'PHONE_NOT_CONFIRMED' });
  console.log('PASS: Yandex account adds a call-confirmed phone to the same uid; other accounts, taken numbers and changed sessions are refused');

  // server side: who may confirm by call, and that a Yandex session can never switch account
  const shared = fs.readFileSync(path.join(root, 'supabase/functions/_shared/waitcall.ts'), 'utf8');
  assert.match(shared, /export async function callerUser/);
  assert.match(shared, /user\.is_anonymous === true\) return user/);
  assert.match(shared, /custom:yandex-id/); assert.match(shared, /!user\.phone_confirmed_at/);
  const completeFn = fs.readFileSync(path.join(root, 'supabase/functions/complete-waitcall/index.ts'), 'utf8');
  assert.match(completeFn, /callerUser\(request\)/);
  assert.match(completeFn, /user\.is_anonymous !== true && mode !== 'phone_change'/, 'a Yandex session may only add the phone to itself');
  assert.match(fs.readFileSync(path.join(root, 'supabase/functions/start-waitcall/index.ts'), 'utf8'), /callerUser\(request\)/);
  console.log('PASS: call confirmation is open to guests and phone-less Yandex accounts only, and Yandex sessions cannot switch accounts');

  // user-facing messages
  assert.match(account.describeAuthError({ code: 'YANDEX_CANCELLED', message: 'Вход через Яндекс отменён.' }), /отменён/);
  const files = fs.readFileSync(path.join(root, 'lib/accountService.js'), 'utf8') + fs.readFileSync(path.join(root, 'lib/yandexAuthBrowser.js'), 'utf8');
  assert.doesNotMatch(files, /[0-9a-f]{32}|client_secret/i, 'no Yandex credentials (32-hex ids/secrets) in app code');
  console.log('PASS: messages are user-facing and no credentials are in the client');
})().catch(error => { console.error(error); process.exit(1); });
