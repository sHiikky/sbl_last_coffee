// Account self-deletion in lib/accountService.js (App Store 5.1.1(v)) and the iOS sign-in rules.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const code = babel.transformSync(read('lib/accountService.js'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Error, Object, String, Array, Number, Map, Promise, JSON, Date, Math, decodeURIComponent,
    process: { env: {} },
    require: name => ({
      './supabaseClient': { supabase: {}, ensureAnonymousSession: async () => {} },
      './notificationService': { unregisterCurrentPushToken: async () => {} },
    })[name] || (() => { throw Error(`Missing mock ${name}`); })(),
  });
  return module.exports;
}

function client({ invokeResult = { data: { ok: true }, error: null } } = {}) {
  const log = [];
  return {
    log,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      signOut: async args => { log.push(['signOut', args.scope]); return { error: null }; },
    },
    functions: { invoke: async (name, args) => { log.push(['invoke', name, JSON.stringify(args.body)]); return invokeResult; } },
  };
}

(async () => {
  const account = load();
  let c = client();
  let service = account.createAccountService({ client: c, ensureSession: async () => {}, removePushToken: async args => c.log.push(['revoke', args.userId]) });
  const result = await service.deleteAccount();
  assert.equal(result.deletedUserId, 'user-1');
  assert.deepEqual(c.log.map(entry => entry[0]), ['invoke', 'revoke', 'signOut']);
  assert.equal(c.log[0][1], 'delete-account');
  assert.equal(c.log[0][2], '{}', 'the server identifies the user from the session, never from the body');
  assert.equal(c.log[2][1], 'local');

  const body = { error: 'Сначала дождитесь выдачи или отмены текущего заказа, затем удалите аккаунт' };
  c = client({ invokeResult: { data: null, error: { context: { status: 409, json: async () => body } } } });
  service = account.createAccountService({ client: c, ensureSession: async () => {} });
  await assert.rejects(() => service.deleteAccount(), error => error.code === 'ACCOUNT_DELETE_FAILED' && /дождитесь выдачи/.test(account.describeAuthError(error)));
  assert.ok(!c.log.some(entry => entry[0] === 'signOut'), 'a refused deletion keeps the user signed in');
  console.log('PASS: account deletion calls delete-account with no user data, revokes push, signs out; refusals show the server reason');

  assert.ok(!('startYandexSignIn' in account) && !('YANDEX_AUTH_ENABLED' in account), 'no third-party sign-in at all');
  const eas = JSON.parse(read('eas.json'));
  for (const name of ['ios-store', 'ios-handoff']) {
    assert.equal(eas.build[name].env.EXPO_PUBLIC_WAITCALL_ENABLED, 'true', `${name}: sign-in by call stays`);
  }
  const app = JSON.parse(read('app.json')).expo;
  assert.equal(app.ios.supportsTablet, false, 'iPhone only');
  assert.equal(app.ios.config.usesNonExemptEncryption, false);
  assert.ok(app.ios.privacyManifests.NSPrivacyAccessedAPITypes.length >= 4, 'required-reason APIs declared');
  const startWaitcall = read('supabase/functions/start-waitcall/index.ts');
  assert.match(startWaitcall, /REVIEW_DEMO_PHONE/);
  assert.match(startWaitcall, /verified: true/);
  console.log('PASS: iOS — sign-in by call only, iPhone only, privacy manifest, export compliance; review demo phone gated by a secret');
})().catch(error => { console.error(error); process.exit(1); });
