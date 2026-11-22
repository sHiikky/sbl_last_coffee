const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');

function load(file, mocks = {}) {
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => { if (!(name in mocks)) throw Error(`Missing mock ${name}`); return mocks[name]; },
    process: { env: {} }, console, Date, Error, Request, Response, AbortSignal, fetch() { throw Error('REAL_NETWORK_FORBIDDEN'); },
  }, { filename: file });
  return module.exports;
}
const EMPTY = { auth: {}, rpc: async () => ({ data: null }) };
const notification = load('lib/notificationService.js', {
  'react-native': { Platform: { OS: 'web' } },
  '@react-native-async-storage/async-storage': {}, 'expo-notifications': {}, 'expo-constants': {},
  'expo-crypto': { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' }, './supabaseClient': { supabase: EMPTY },
});
const account = load('lib/accountService.js', {
  './supabaseClient': { supabase: EMPTY, ensureAnonymousSession: async () => {} },
  './notificationService': { unregisterCurrentPushToken: async () => {} },
  './yandexAuthBrowser': { YANDEX_REDIRECT_URL: 'sbl://auth/yandex', openYandexAuthSession: async () => ({ type: 'cancel' }) },
});
const workerModule = load('supabase/functions/_shared/orderNotificationWorker.js');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROJECT = 'bff41dba-7718-423d-8898-1003aae445db';
const ORDER = '10000000-0000-4000-8000-000000000001';
const DEVICE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOKEN = 'ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const guest = { id: USER_A, is_anonymous: true };
const verified = { id: USER_A, is_anonymous: false, phone: '79991234567', phone_confirmed_at: '2026-01-01T00:00:00Z' };
const log = [];

function authClient({ updateError, verifyError, target = verified } = {}) {
  return { auth: {
    async getUser() { return { data: { user: guest } }; },
    async getSession() { return { data: { session: { user: guest } } }; },
    async updateUser(args) { log.push(['update', args]); return { error: updateError }; },
    async signInWithOtp(args) { log.push(['signin', args]); return {}; },
    async resend(args) { log.push(['resend', args]); return {}; },
    async verifyOtp(args) { log.push(['verify', args]); return { error: verifyError, data: { user: target } }; },
    async signOut(args) { log.push(['signout', args]); return {}; },
  }, rpc: async () => ({ data: null }) };
}
function memory() { const values = new Map(); return { values, getItem: async k => values.get(k) || null, setItem: async (k,v) => { values.set(k,v); }, removeItem: async k => { values.delete(k); } }; }

function nativeService({ registerError = null, unregisterError = null, changeUser = false } = {}) {
  const calls = []; const storage = memory(); let reads = 0; let granted = false;
  const client = {
    auth: { async getUser() { return { data: { user: changeUser && ++reads > 1 ? { id: USER_B } : guest } }; }, async getSession() { return { data: { session: { user: guest } } }; } },
    async rpc(name,args) { calls.push([name,args]); return { error: name === 'register_device_push_token' ? registerError : unregisterError }; },
  };
  const notifications = {
    AndroidImportance: { HIGH: 4 }, async setNotificationChannelAsync() { calls.push(['channel']); },
    async getPermissionsAsync() { return { granted, status: granted ? 'granted' : 'denied', canAskAgain: true }; },
    async requestPermissionsAsync() { calls.push(['permission']); granted = true; return { granted: true, status: 'granted' }; },
    async getExpoPushTokenAsync() { calls.push(['expoToken']); return { data: TOKEN }; },
  };
  const service = notification.createNotificationService({ client, storage, notifications, platform: 'android', constants: { easConfig: { projectId: PROJECT } }, enabled: true, randomUUID: () => DEVICE });
  return { service, calls, storage, client, deny() { granted = false; } };
}

function event({ receipt = false, age = 16 * 60000 } = {}) {
  return { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lease_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', order_id: ORDER, order_number: 12, customer_id: USER_A, event_status: 'ready', deliveries: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', device_id: DEVICE, token: TOKEN, state: receipt ? 'ticketed' : 'pending', attempts: 1, ticket_id: receipt ? 'ticket-1' : null, ticket_created_at: receipt ? new Date(Date.now() - age).toISOString() : null }] };
}
function worker({ entries = [event()], allowed = true, enabled = true, activeToken = true, owner = USER_A, currentStatus = 'ready', leaseAccepted = true, fetchImpl } = {}) {
  const calls = []; const sent = [];
  const admin = {
    async rpc(name,args) { calls.push([name,args]); return { data: name === 'claim_order_notifications' ? entries : leaseAccepted }; },
    from(table) { return { select() { return {
      eq() { return { async maybeSingle() { return { data: { status: currentStatus, customer_id: USER_A } }; } }; },
      async in() { return { data: [{ id: DEVICE, enabled: activeToken, user_id: owner, expo_push_token: TOKEN }] }; },
    }; } }; },
  };
  const handle = workerModule.createOrderNotificationWorker({ admin, authenticateStaff: async () => allowed, enabled, workerSecret: 'local-worker-secret', fetchImpl: async (url,options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return fetchImpl ? fetchImpl(url, options) : new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }), { status: 200 });
  } });
  const request = (body = { orderId: ORDER }, headers = { authorization: 'Bearer local-staff-jwt' }) => new Request('http://localhost/dispatch', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { handle, request, calls, sent };
}

(async () => {
  assert.equal(account.normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(account.normalizePhone('9991234567'), '+79991234567');
  assert.throws(() => account.normalizePhone('+19991234567'), /полностью/);
  assert.equal(account.getVerifiedAccount({ ...verified, is_anonymous: true }), null);
  assert.equal(account.getVerifiedAccount({ ...verified, phone_confirmed_at: null }), null);
  assert.equal(account.getVerifiedAccount({ user: verified }).phone, '+79991234567');
  let ensures = 0;
  const disabled = account.createAccountService({ client: authClient(), ensureSession: async () => { ensures++; }, enabled: false });
  await assert.rejects(disabled.startPhoneSignIn('9991234567'), e => e.code === 'PHONE_AUTH_DISABLED');
  assert.equal(ensures,0); assert.equal(log.length,0);
  console.log('PASS: normalized phones; only verified non-anonymous users become accounts; disabled SMS makes zero auth requests');

  let time = 0;
  const upgrade = account.createAccountService({ client: authClient(), ensureSession: async () => {}, enabled: true, now: () => time });
  const challenge = await upgrade.startPhoneSignIn('9991234567');
  assert.equal(challenge.mode,'phone_change');
  await assert.rejects(upgrade.startPhoneSignIn('9991234567'), e => e.code === 'OTP_COOLDOWN');
  await assert.rejects(upgrade.verifyPhoneSignIn({ ...challenge, token:'1234' }), e => e.code === 'INVALID_CODE');
  const result = await upgrade.verifyPhoneSignIn({ ...challenge, token:'123456' });
  assert.equal(result.id,USER_A); assert.equal(log.filter(x=>x[0]==='verify').length,1); assert.equal(log.at(-1)[1].type,'phone_change');
  time = 61000;
  await upgrade.resendPhoneSignIn(challenge);
  assert.equal(log.at(-1)[1].type,'phone_change');
  const expired=account.createAccountService({client:authClient({verifyError:{code:'otp_expired'}}),ensureSession:async()=>{},enabled:true});
  const expiredChallenge=await expired.startPhoneSignIn('9991234567');
  await assert.rejects(expired.verifyPhoneSignIn({...expiredChallenge,token:'123456'}),e=>e.code==='otp_expired');
  console.log('PASS: anonymous upgrade preserves uid; six-digit verification is server-only; sending/resend cooldown is enforced');

  for (const code of ['phone_provider_disabled','request_timeout','over_sms_send_rate_limit',undefined]) {
    log.length = 0;
    const service = account.createAccountService({ client: authClient({ updateError: Object.assign(new Error('unavailable'),{code}) }), ensureSession: async () => {}, enabled:true });
    await assert.rejects(service.startPhoneSignIn('9991234567'));
    assert.equal(log.some(x=>x[0]==='signin'),false);
  }
  log.length=0;
  const existing = account.createAccountService({ client: authClient({ updateError:{code:'phone_exists'}, target:{...verified,id:USER_B} }), ensureSession:async()=>{},removePushToken:async()=>log.push(['revoke']),enabled:true });
  const existingChallenge=await existing.startPhoneSignIn('9991234567');
  const signedIn=await existing.verifyPhoneSignIn({...existingChallenge,token:'123456'});
  assert.equal(signedIn.id,USER_B); assert.equal(log.find(x=>x[0]==='signin')[1].options.shouldCreateUser,false);
  assert(log.findIndex(x=>x[0]==='revoke')<log.findIndex(x=>x[0]==='verify'));
  assert.equal(log.at(-1)[1].type,'sms');
  log.length=0;
  const logout=account.createAccountService({client:authClient(),ensureSession:async()=>{},removePushToken:async()=>{throw Error('offline');}});
  await assert.rejects(logout.signOutAccount()); assert.equal(log.some(x=>x[0]==='signout'),false);
  console.log('PASS: only phone_exists permits login fallback; previous push registration is revoked before switching/sign-out');

  const native=nativeService();
  await native.service.getOrderNotificationSettings(); assert.equal(native.calls.length,0);
  const settings=await native.service.enableOrderNotifications();
  assert(settings.enabled); assert.equal(native.calls.filter(x=>x[0]==='permission').length,1);
  const registration=native.calls.find(x=>x[0]==='register_device_push_token')[1];
  assert.equal(registration.p_expo_push_token,TOKEN); assert.equal(registration.user_id,undefined);
  await native.service.refreshPushRegistration({userId:USER_A}); assert.equal(native.calls.filter(x=>x[0]==='permission').length,1);
  native.deny(); await native.service.refreshPushRegistration({userId:USER_A});
  assert(native.calls.some(x=>x[0]==='unregister_device_push_token'));
  assert.equal((await native.service.getOrderNotificationSettings()).enabled,false);
  const switching=nativeService({changeUser:true});
  await assert.rejects(switching.service.enableOrderNotifications(),e=>e.code==='SESSION_CHANGED');
  assert(!switching.calls.some(x=>x[0]==='register_device_push_token'));
  const failure=nativeService({unregisterError:{code:'NETWORK'}});
  await failure.service.enableOrderNotifications();
  await assert.rejects(failure.service.unregisterCurrentPushToken({userId:USER_A}));
  assert.equal((await failure.service.getOrderNotificationSettings()).enabled,true);
  const uncertain=nativeService({registerError:{code:'NETWORK'}});
  await assert.rejects(uncertain.service.enableOrderNotifications());
  await uncertain.service.unregisterCurrentPushToken({userId:USER_A});
  assert(uncertain.calls.some(x=>x[0]==='unregister_device_push_token'));
  console.log('PASS: explicit-only push permission, guest-owned registration, opt-out/revocation, account-change race and failed-unregister retention');

  const web=notification.createNotificationService({ client:{auth:{getSession:async()=>({data:{session:null}})}},storage:memory(),notifications:{requestPermissionsAsync(){throw Error('unexpected permission');}},platform:'web',enabled:true });
  assert.equal((await web.getOrderNotificationSettings()).supported,false);
  await assert.rejects(web.enableOrderNotifications(),e=>e.code==='UNSUPPORTED_PLATFORM');
  assert.equal(notification.getOrderIdFromNotification({notification:{request:{content:{data:{type:'order_status',orderId:'javascript:bad'}}}}}),null);
  console.log('PASS: web is gracefully unsupported; notification routes accept order UUIDs only');

  let w=worker();
  assert.equal((await w.handle(w.request({},{}))).status,401); assert.equal(w.calls.length,0);
  w=worker({allowed:false}); assert.equal((await w.handle(w.request())).status,403); assert.equal(w.calls.length,0);
  w=worker({enabled:false}); assert.equal((await w.handle(w.request())).status,503); assert.equal(w.calls.length,0); assert.equal(w.sent.length,0);
  w=worker(); assert.equal((await w.handle(w.request({orderId:ORDER,to:TOKEN}))).status,400); assert.equal(w.calls.length,0);
  w=worker({entries:[]}); assert.equal((await w.handle(w.request({}, {'x-order-push-secret':'local-worker-secret'}))).status,200);
  console.log('PASS: worker rejects missing/non-staff auth, arbitrary recipients, and disabled delivery before DB/network effects');

  w=worker(); const sent=await w.handle(w.request()); const sentBody=await sent.json();
  assert.equal(sentBody.ticketed,1); assert.equal(sentBody.delivered,0);
  assert.equal(w.calls.find(([name])=>name==='claim_order_notifications')[1].p_limit,1);
  assert(w.calls.some(([name])=>name==='renew_order_notification_lease'));
  assert.equal(w.sent[0].body[0].data.orderId,ORDER);
  assert.equal(w.sent[0].body[0].to,TOKEN);
  assert(!JSON.stringify(sentBody).includes(TOKEN));
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='ticketed'));
  for (const config of [{activeToken:false},{owner:USER_B},{currentStatus:'cancelled'}]) {
    w=worker(config); await w.handle(w.request()); assert.equal(w.sent.length,0);
    assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='disabled'));
  }
  console.log('PASS: server-derived order payload; Expo tickets are not delivery; stale status, opt-out and changed ownership suppress sending');

  w=worker({fetchImpl:async()=>{throw Error('network timeout');}}); await w.handle(w.request());
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='retry'));
  w=worker({fetchImpl:async()=>new Response('{}',{status:429})}); await w.handle(w.request());
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='retry'));
  w=worker({fetchImpl:async()=>new Response(JSON.stringify({data:[{status:'error',details:{error:'DeviceNotRegistered'}}]}),{status:200})}); await w.handle(w.request());
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='disabled'&&a.p_error_code==='DeviceNotRegistered'));
  w=worker({leaseAccepted:false}); await w.handle(w.request()); assert(!w.calls.some(([n])=>n==='finish_order_notification')); assert.equal(w.sent.length,0);
  console.log('PASS: transient Expo failures retry; DeviceNotRegistered invalidates; a lost lease prevents finalization');

  w=worker({entries:[event({receipt:true})],fetchImpl:async()=>new Response(JSON.stringify({data:{'ticket-1':{status:'ok'}}}),{status:200})}); await w.handle(w.request());
  assert(w.sent.every(x=>x.url.endsWith('/getReceipts')));
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='delivered'));
  w=worker({entries:[event({receipt:true})],fetchImpl:async()=>new Response(JSON.stringify({data:{}}),{status:200})}); await w.handle(w.request());
  assert(w.sent.every(x=>x.url.endsWith('/getReceipts')));
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='ticketed'&&a.p_ticket_id==='ticket-1'));
  w=worker({entries:[event({receipt:true,age:25*3600000})]}); await w.handle(w.request()); assert.equal(w.sent.length,0);
  assert(w.calls.some(([n,a])=>n==='record_order_notification_result'&&a.p_state==='failed'));
  console.log('PASS: receipts confirm delivery, missing receipts never resend, expired receipts fail without another push');

  for(const file of ['screens/ProfileScreen.js','screens/LoginScreen.js','screens/AccountDocumentsScreen.js','screens/NotificationSettingsScreen.js','hooks/useOrderNotifications.js']) {
    babel.transformSync(fs.readFileSync(path.join(root,file),'utf8'),{filename:path.join(root,file),babelrc:false,configFile:false,presets:[require.resolve('babel-preset-expo',{paths:[path.dirname(require.resolve('expo/package.json'))]})]});
  }
  console.log('PASS: account/profile/notification UI and hook compile with the Expo Babel preset');
})().catch(error=>{console.error(error);process.exitCode=1;});
