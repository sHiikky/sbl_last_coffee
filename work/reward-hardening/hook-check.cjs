// Test auth changes, out-of-order responses, failed reads and refresh triggers
// without starting the application or contacting any Supabase project.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const filename = require('path').resolve(__dirname, '../../loyalty/useLoyaltyState.js');
const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
let slots = [], cursor = 0, effects = [], dirty = false, result, history = [];
let authCallback, foregroundCallback, realtimeCallback, sessionId = 'a';
let plans = [], gifts = ['gift-a'];
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const React = {
  useState(initial) {
    const i = cursor++;
    if (!slots[i]) slots[i] = { value: initial };
    return [slots[i].value, value => {
      const next = typeof value === 'function' ? value(slots[i].value) : value;
      if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
    }];
  },
  useRef(initial) {
    const i = cursor++;
    if (!slots[i]) slots[i] = { value: { current: initial } };
    return slots[i].value;
  },
  useCallback(callback, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: callback, deps };
    return slots[i].value;
  },
  useEffect(callback, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => {
      slots[i]?.cleanup?.();
      slots[i] = { deps, cleanup: callback() };
    });
  },
};
const channel = { on(_event, _filter, cb) { realtimeCallback = cb; return this; }, subscribe() { return this; } };
const supabase = {
  auth: {
    onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: { user: { id: sessionId } } } }; },
  },
  channel: () => channel, removeChannel: async () => {},
};
const AppState = { currentState: 'active', addEventListener(_type, cb) { foregroundCallback = cb; return { remove() {} }; } };
const modules = {
  react: React, 'react-native': { AppState }, '../lib/supabaseClient': { supabase },
  './loyaltyService': { getCycleProgress: () => ({ cycle: 1, progress: 0, cycleLength: 10 }) },
  './loyaltyApi': { async fetchLoyaltySnapshot(id) {
    if (plans.length) return plans.shift()(id);
    return { customerId: id, visitedDays: [], currentStreak: 0, rewards: gifts.map(id => ({ id, status: 'available' })) };
  } },
};
const moduleObject = { exports: {} };
vm.runInNewContext(code, {
  exports: moduleObject.exports, module: moduleObject, require: name => {
    if (!modules[name]) throw Error(name);
    return modules[name];
  }, setInterval: () => 1, clearInterval() {}, console,
}, { filename });
const hook = moduleObject.exports.default;
function render() {
  let n = 0;
  do {
    dirty = false; cursor = 0; effects = []; result = hook(history);
    effects.forEach(run => run());
    if (++n > 20) throw Error('render loop');
  } while (dirty);
}
async function settle() {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render(); }
}
(async () => {
  render(); await settle();
  assert.equal(result.customerId, 'a'); assert.equal(result.ready, true);
  let finishSlow;
  plans.push(() => new Promise(resolve => { finishSlow = resolve; }));
  const oldRead = result.refresh();
  sessionId = 'b'; gifts = ['gift-b'];
  authCallback('SIGNED_IN', { user: { id: 'b' } }); render(); await settle();
  finishSlow({ customerId: 'a', rewards: [{ id: 'gift-a', status: 'available' }] });
  await oldRead; await settle();
  assert.equal(result.customerId, 'b'); assert.equal(result.rewards[0].id, 'gift-b');
  authCallback('TOKEN_REFRESHED', { user: { id: 'b' } }); render(); await settle();
  assert.equal(result.ready, true); assert.equal(result.rewards[0].id, 'gift-b');
  plans.push(() => Promise.reject(Error('offline')));
  await result.refresh(); await settle();
  assert.equal(result.rewards.length, 0); assert.ok(result.error);
  foregroundCallback('active'); await settle();
  assert.equal(result.rewards[0].id, 'gift-b'); assert.equal(result.error, null);
  gifts = ['gift-b', 'gift-b-20']; realtimeCallback(); await settle();
  assert.equal(result.celebratingReward.id, 'gift-b-20');
  result.dismissCelebration(); render();
  realtimeCallback(); await settle(); assert.equal(result.celebratingReward, null);
  const count = result.rewards.length;
  history = [{ devSynthetic: true, createdAt: '2099-01-01' }]; render(); await settle();
  assert.equal(result.rewards.length, count);
  authCallback('SIGNED_OUT', null); render(); await settle();
  assert.equal(result.rewards.length, 0); assert.equal(result.celebratingReward, null);
  console.log('PASS: session switch, stale-response rejection, token refresh, offline gifts hidden, foreground/realtime recovery, one celebration, synthetic orders ignored, sign-out');
})().catch(error => { console.error(error); process.exitCode = 1; });
