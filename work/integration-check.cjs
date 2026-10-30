const fs = require('fs'), path = require('path'), vm = require('vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file, mocks, globals = {}) {
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: n => {
    if (n === './cartOptions') return require('./load-domain.cjs')('lib/cartOptions.js');
    if (!(n in mocks)) throw Error('Missing mock: ' + n);
    return mocks[n];
  }, queueMicrotask, console, ...globals });
  return module.exports;
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

(async () => {
  let loginCalls = 0;
  const session = { user: { id: 'guest' } };
  const auth = {
    async getSession() { return { data: { session: null } }; },
    async signInAnonymously() { loginCalls++; await flush(); return { data: { session } }; },
  };
  const client = load('lib/supabaseClient.js', {
    'react-native': { Platform: { OS: 'web' } },
    'react-native-url-polyfill': { setupURLPolyfill() {} },
    '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient: () => ({ auth }) },
  }, { process: { env: {} } });
  const sessions = await Promise.all(Array.from({ length: 8 }, () => client.ensureAnonymousSession()));
  assert.equal(loginCalls, 1); assert(sessions.every(x => x === session));
  console.log('PASS: eight concurrent consumers create one anonymous session');

  let authCallback, foregroundCallback, userId = 'a', reads = 0;
  const timers = new Set(), channels = [];
  const supabase = {
    auth: { onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() { authCallback = null; } } } }; } },
    channel(name) {
      const channel = { name, removed: false, on(_event, filter, cb) { this.filter = filter; this.cb = cb; return this; }, subscribe(cb) { this.status = cb; return this; } };
      channels.push(channel); return channel;
    }, removeChannel(channel) { channel.removed = true; },
  };
  const { createCustomerDataSource } = load('lib/customerDataSource.js', {
    'react-native': { AppState: { currentState: 'active', addEventListener(_event, cb) { foregroundCallback = cb; return { remove() { foregroundCallback = null; } }; } } },
    './supabaseClient': { supabase, getUserOrThrow: async () => ({ id: userId }) },
  }, { setInterval(cb) { timers.add(cb); return cb; }, clearInterval(cb) { timers.delete(cb); } });
  let plan = null;
  const source = createCustomerDataSource({ name: 'test', table: 'orders', empty: [], async read(id) {
    reads++;
    if (plan) { const current = plan; plan = null; return current.promise; }
    return ['current-' + id];
  } });
  const received = [];
  const unsubA = source.subscribe(s => received.push(s));
  const unsubB = source.subscribe(() => {});
  await flush();
  assert.equal(channels.length, 1); assert.equal(reads, 1);
  assert.equal(source.getSnapshot().data[0], 'current-a');
  const slow = deferred(); plan = slow;
  const pending = source.refresh(); await flush();
  userId = 'b'; authCallback('SIGNED_IN', { user: { id: 'b' } }); await flush();
  assert.equal(source.getSnapshot().customerId, 'b'); assert.equal(source.getSnapshot().data.length, 0);
  slow.resolve(['stale-a']); await pending; await flush();
  assert.equal(source.getSnapshot().data[0], 'current-b');
  assert(!received.some(s => s.data[0] === 'stale-a'));
  assert(channels[0].removed);
  const before = reads; foregroundCallback('active'); await flush();
  assert.equal(reads, before + 1);
  channels.at(-1).cb({}); await flush(); assert.equal(reads, before + 2);
  channels.at(-1).status('SUBSCRIBED'); await flush(); assert.equal(reads, before + 3);
  [...timers][0](); await flush(); assert.equal(reads, before + 4);
  plan = deferred(); const failing = plan; const failedRead = source.refresh(); await flush();
  failing.reject(new Error('offline')); await failedRead; await flush();
  assert.equal(source.getSnapshot().error.message, 'offline');
  await source.refresh(); assert.equal(source.getSnapshot().error, null);
  unsubA(); assert(!channels.at(-1).removed); unsubB();
  assert.equal(timers.size, 0); assert(channels.at(-1).removed);
  assert.equal(source.getSnapshot().customerId, null);
  console.log('PASS: shared channel, session isolation, stale response rejection, reconnect/foreground/poll recovery, offline error and cleanup');

  const { toCustomerOrder } = load('lib/customerOrders.js', { './supabaseClient': {} });
  const order = toCustomerOrder({ id: 'o', order_number: 15, total: '200.50', bonus_redeemed: '50', bonus_earned: '7', status: 'completed', order_items: [
    { id: 'gift', product_id: 'cake', product_name: 'Cake', quantity: 1, price: '0' },
    { id: 'paid', product_id: 'cake', product_name: 'Cake', quantity: 2, price: '100.25' },
  ] });
  assert.equal(order.items.length, 1); assert.equal(order.items[0].qty, 3);
  assert.equal(order.items[0].unitPrice, 100.25); assert.equal(order.total, 150.5);
  assert.equal(order.itemCount, 3); assert.equal(order.status, 'completed');
  console.log('PASS: server order snapshots, numeric totals, gift/paid SKU aggregation and status');
})().catch(error => { console.error(error); process.exitCode = 1; });
