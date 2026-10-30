const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const loadDomain = require('./load-domain.cjs');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const clone = value => JSON.parse(JSON.stringify(value));
const root = path.resolve(__dirname, '..');
const screenCode = babel.transformSync(fs.readFileSync(path.join(root, 'screens/CartScreen.js'), 'utf8'), {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'],
}).code;

function makeCart({ preparationGate = null } = {}) {
  const rpc = deferred(), calls = { submitted: [], saved: [], cleared: [], marked: [], orders: [], alerts: [], refreshes: 0 };
  let owner = 'customer-A', pending = null, stateIndex = 0, refIndex = 0;
  const states = [], refs = [];
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useState(initial) {
      const index = stateIndex++; if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef(initial) { const index = refIndex++; if (!(index in refs)) refs[index] = { current: initial }; return refs[index]; },
    useEffect() {},
  };
  const native = { Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 390 }), StyleSheet: { create: value => value }, Alert: { alert() {} } };
  for (const name of ['View', 'Text', 'TextInput', 'TouchableOpacity', 'FlatList', 'ScrollView', 'KeyboardAvoidingView']) native[name] = name;
  const service = {
    async getPendingCheckoutAttempt() { if (preparationGate) return preparationGate.promise; return pending; },
    async savePendingCheckoutAttempt(value) { calls.saved.push(value); pending = { ...value }; },
    async clearPendingCheckoutAttempt(key) { calls.cleared.push(key); if (!key || pending?.idempotencyKey === key) pending = null; },
    async markPendingCheckoutAttemptState(...args) { calls.marked.push(args); },
    generateIdempotencyKey: () => 'attempt-A', buildRequestFingerprint: value => JSON.stringify(value),
    async createOrder(value) { calls.submitted.push(value); return rpc.promise; },
    classifyOrderError: () => ({ type: 'unknown', code: null }),
    CHECKOUT_ATTEMPT_STATE: { SUBMITTING: 'submitting', UNKNOWN: 'unknown' }, CHECKOUT_RECOVERY_OUTCOME: {},
  };
  const mocks = {
    react: { __esModule: true, default: React, ...React }, 'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-haptics': { notificationAsync: async () => {}, selectionAsync: async () => {}, NotificationFeedbackType: { Success: 'success', Error: 'error' } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../theme/tokens': { colors: {}, spacing: {}, radius: {}, shadow: {}, getHorizontalPadding: () => 16 },
    '../data/products': { PICKUP_TIMES: ['Через 3–5 минут'], PICKUP_POINTS: ['SBL'], formatPrice: String, cartKey: String },
    '../loyalty/loyaltyService': { getAvailableRewards: () => [], isRewardApplicable: () => false, getEligibleCartItemsForReward: () => [] },
    '../lib/supabaseClient': { getUserOrThrow: async () => ({ id: owner }) },
    '../lib/checkoutQuote': { money: value => value, buildCheckoutQuote: (_items, payable) => ({ version: 2, items: [], payable }) },
    '../lib/cartOptions': { formatAdditions: () => '' }, '../lib/orderService': service,
    '../lib/phoneInput': loadDomain('lib/phoneInput.js'),
    '../lib/ordering': { CAFE: { pointId: 'lenina-72' }, validateContact: value => value, orderingState: () => ({ isOpen: true }), fetchOrderingConfig: async () => ({}), formatPickupTime: () => '13:00' },
    '../hooks/useBonusAccount': { __esModule: true, default: () => ({ balance: 0, lifetimePaid: 0, refresh: async () => { calls.refreshes++; } }) },
    '../lib/bonusConfig': { getBonusLevel: () => ({ rate: 0.05 }), maxRedeemable: () => 0 },
  };
  const moduleObject = { exports: {} };
  vm.runInNewContext(screenCode, { module: moduleObject, exports: moduleObject.exports, console: { warn() {} }, globalThis: { alert: message => calls.alerts.push(message) }, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('../components/')) return { __esModule: true, default: name };
    throw new Error('Unexpected dependency: ' + name);
  } });
  function render() {
    stateIndex = 0; refIndex = 0;
    return moduleObject.exports.default({ navigation: {}, getCurrentCustomerId: () => owner,
      cart: { coffee: { id: 'coffee', key: 'coffee', name: 'Кофе', qty: 1, unitPrice: 100 } },
      onOrder: value => calls.orders.push(value), products: [], onRefreshCheckout: async () => {},
      loyaltyState: { rewards: [], refresh: async () => { calls.refreshes++; } } });
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const value of (Array.isArray(node) ? node : Object.values(node))) { const child = find(value, predicate); if (child) return child; }
    return null;
  }
  let tree = render();
  find(tree, node => node.props?.accessibilityLabel === 'Ваше имя').props.onChangeText('Анна');
  find(tree, node => node.props?.accessibilityLabel === 'Телефон для связи').props.onChangeText('+79990000001');
  tree = render();
  const button = find(tree, node => node.props?.fullWidth && node.props?.haptic === 'success'); assert(button);
  return { calls, rpc, click: button.props.onPress, switchOwner(next) { owner = next; }, setPending(value) { pending = value; }, getPending: () => pending };
}

function recoveryService() {
  let raw = null; const lookup = deferred(); const calls = [];
  const storage = { async getItem() { return raw; }, async setItem(_key, value) { raw = value; }, async removeItem() { raw = null; } };
  const service = loadDomain('lib/orderService.js', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'expo-crypto': { randomUUID: () => 'unused' },
    './supabaseClient': { supabase: { async rpc(name, args) { calls.push({ name, args }); assert.equal(name, 'get_order_by_idempotency_key', 'Recovery must never create orders'); return lookup.promise; } } },
  });
  return { service, lookup, calls, makeOld() { const value = JSON.parse(raw); value.createdAt = new Date(Date.now() - 120000).toISOString(); raw = JSON.stringify(value); } };
}

(async () => {
  for (const fail of [false, true]) {
    const h = makeCart(); const request = h.click(); await flush();
    assert.equal(h.calls.submitted.length, 1); assert.equal(h.calls.submitted[0].contact.customer_id, 'customer-A');
    h.switchOwner('customer-B'); h.setPending({ idempotencyKey: 'attempt-B', customerId: 'customer-B' });
    if (fail) h.rpc.reject(new Error('request timeout after session changed'));
    else h.rpc.resolve({ id: 'order-A', order_number: 1, total: 100, bonus_redeemed: 0, status: 'new' });
    await request; await flush();
    assert.equal(h.calls.orders.length, 0, 'A late checkout result must not call onOrder in B');
    assert.equal(h.calls.cleared.length, 0, 'A late checkout result must not clear B pending metadata');
    assert.equal(h.calls.marked.length, 0, 'A late checkout error must not mutate B pending state');
    assert.equal(h.calls.refreshes, 0, 'A late result must not refresh benefits for another account');
    assert.equal(h.getPending().idempotencyKey, 'attempt-B');
  }
  console.log('PASS: late success and error from checkout A cannot publish an order, clear/mark pending B or refresh B benefits');

  {
    const gate = deferred(), h = makeCart({ preparationGate: gate }); const preparing = h.click(); await flush();
    h.switchOwner('customer-B'); h.setPending({ idempotencyKey: 'attempt-B', customerId: 'customer-B' });
    gate.resolve(null); await preparing;
    assert.equal(h.calls.submitted.length, 0);
    assert.equal(h.calls.saved.length, 0, 'Old preparation cannot overwrite B pending before the RPC owner guard');
    assert.equal(h.getPending().idempotencyKey, 'attempt-B');
    console.log('PASS: a session change during checkout preparation prevents persistence as well as submission');
  }
  {
    const h = recoveryService();
    await h.service.savePendingCheckoutAttempt({ idempotencyKey: 'attempt-A', customerId: 'customer-A', state: 'unknown', items: [{ id: 'coffee', qty: 2, preparationNote: 'Vanilla', modifiers: [{ id: 'syrup', quantity: 3, unitPrice: 10 }] }] });
    const recovery = h.service.recoverPendingCheckoutOnce([], { auto: false }); await flush(); assert.equal(h.calls.length, 1);
    await h.service.savePendingCheckoutAttempt({ idempotencyKey: 'attempt-B', customerId: 'customer-B', state: 'submitting', items: [{ id: 'tea', qty: 1 }] });
    h.lookup.resolve({ data: [{ id: 'order-A', status: 'new' }] }); const result = await recovery;
    assert.equal(result.outcome, 'found_active');
    assert.deepEqual(clone(result.attemptItems), [{ id: 'coffee', qty: 2, preparationNote: 'Vanilla', modifiers: [{ id: 'syrup', quantity: 3 }] }]);
    assert.equal((await h.service.getPendingCheckoutAttempt()).idempotencyKey, 'attempt-B');
    await h.service.markPendingCheckoutAttemptState('attempt-A', 'unknown');
    assert.equal((await h.service.getPendingCheckoutAttempt()).state, 'submitting');
    console.log('PASS: old recovery preserves a newer pending key and returns the original product/modifier quantities');
  }
  {
    const h = recoveryService();
    await h.service.savePendingCheckoutAttempt({ idempotencyKey: 'attempt-A', state: 'unknown', items: [{ id: 'coffee', qty: 1 }] }); h.makeOld();
    const recovery = h.service.recoverPendingCheckoutOnce([], { auto: false }); await flush();
    await h.service.savePendingCheckoutAttempt({ idempotencyKey: 'attempt-B', state: 'submitting', items: [{ id: 'tea', qty: 1 }] });
    h.lookup.resolve({ data: [] }); const result = await recovery;
    assert.equal(result.outcome, 'not_found_final');
    assert.equal((await h.service.getPendingCheckoutAttempt()).idempotencyKey, 'attempt-B');
    console.log('PASS: an old final not-found response also cannot clear a newer pending attempt');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
