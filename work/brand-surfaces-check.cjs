const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
let now = 0, stateListener, removed = 0;
const timings = [];
const AppState = {
  currentState: 'active',
  addEventListener(event, callback) {
    assert.equal(event, 'change');
    stateListener = callback;
    return { remove() { stateListener = undefined; removed++; } };
  },
};
const Animated = {
  Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate(options) { return { source: this, options }; } },
  timing(value, options) {
    const entry = { value, options, stopped: false, start(callback) { this.callback = callback; }, stop() { this.stopped = true; this.callback?.({ finished: false }); } };
    timings.push(entry);
    return entry;
  },
};
function load(file, mocks) {
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Date: { now: () => now }, Math });
  return module.exports;
}
const finish = load('theme/holographic.js', {});
const clock = load('lib/holographicMotion.js', { 'react-native': { AppState, Animated, Easing: { linear: 'linear' } }, '../theme/holographic': finish });
const releaseHome = clock.acquireHolographicMotion();
assert.equal(timings.length, 1); assert.equal(timings[0].options.duration, 12000);
assert.equal(timings[0].options.easing, 'linear');
now = 900;
const releaseButton = clock.acquireHolographicMotion();
assert.equal(timings.length, 1, 'A second screen must share the running animation, not restart its phase');
now = 3000; stateListener('background');
assert.equal(timings[0].stopped, true);
assert.equal(clock.holographicMotion.value, 1 / 4);
now = 15000; stateListener('active');
assert.equal(timings.length, 2); assert.equal(timings[1].options.duration, 9000, 'Background time is not added to motion');
releaseButton(); releaseButton(); assert.equal(timings[1].stopped, false, 'Release is idempotent and another consumer still owns the clock');
now = 18000; releaseHome(); assert.equal(timings[1].stopped, true); assert.equal(removed, 1);
assert.equal(clock.holographicMotion.value, 1 / 2);
now = 30000;
const releaseRemount = clock.acquireHolographicMotion();
assert.equal(timings.length, 3); assert.ok(Math.abs(timings[2].options.duration - 6000) < 1e-8, 'A remount continues the remaining phase');
timings[0].callback({ finished: true }); assert.equal(clock.holographicMotion.value, 1 / 2, 'Late callbacks cannot finish a newer animation');
now = 42000; timings[2].callback({ finished: true });
assert.equal(clock.holographicMotion.value, 0);
assert.equal(timings.length, 4); assert.equal(timings[3].options.duration, 12000, 'The next full sweep continues after the first pass');
now = 47000;
const releaseLateScreen = clock.acquireHolographicMotion();
assert.equal(timings.length, 4, 'A screen mounted after the first 12 seconds joins the shared sweep');
releaseRemount(); assert.equal(timings[3].stopped, false);
releaseLateScreen(); assert.equal(timings[3].stopped, true);
assert.ok(Math.abs(clock.holographicMotion.value - 5 / 12) < 1e-10);
timings[3].callback({ finished: true });
assert.equal(timings.length, 4, 'A completion callback after cleanup cannot schedule another sweep');
now = 70000;
const releaseAgain = clock.acquireHolographicMotion();
assert.equal(timings.length, 5); assert.ok(Math.abs(timings[4].options.duration - 7000) < 1e-8);
releaseAgain();
console.log('PASS: shared 12s phase, multiple consumers, background pause, idempotent release, repeated sweeps, late mount, paused remount and stale callback cleanup');

// Exercise the real Surface hook gate: an unresolved or reduced preference
// renders the still phase and owns no lease; a late screen shares the clock.
let activeHarness;
let preference = { reduceMotion: true };
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useRef(initial) { const h = activeHarness, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useState(initial) { const h = activeHarness, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], value => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }]; },
  useEffect(fn, deps) { const h = activeHarness, i = h.cursor++; const old = h.slots[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) h.effects.push(() => { old?.cleanup?.(); h.slots[i] = { deps, cleanup: fn() }; }); },
};
const Surface = load('components/HolographicSurface.js', {
  react: React,
  'react-native': { View: 'View', Animated: { ...Animated, View: 'AnimatedView' }, StyleSheet: { create: value => value, absoluteFill: {} } },
  'expo-linear-gradient': { LinearGradient: 'Gradient' },
  '../theme/tokens': { colors: {} },
  '../theme/holographic': finish,
  '../lib/holographicMotion': clock,
  '../hooks/useMotionPreference': () => preference,
}).default;
function surface() {
  const h = { cursor: 0, slots: [], effects: [] };
  h.render = () => { activeHarness = h; h.cursor = 0; h.effects = []; const tree = Surface({}); h.effects.forEach(effect => effect()); return tree; };
  h.stop = () => h.slots.forEach(slot => slot?.cleanup?.());
  return h;
}
const a = surface(), b = surface();
const staticTree = a.render(); b.render();
assert.equal(timings.length, 5, 'Conservative initial preference must not start motion');
const phaseSource = tree => tree.props.children[1].props.style[1].transform[0].translateX.source;
assert.equal(phaseSource(staticTree).value, 0.5);
preference = { reduceMotion: false };
const liveA = a.render(), liveB = b.render();
assert.equal(timings.length, 6);
assert.equal(phaseSource(liveA), clock.holographicMotion); assert.equal(phaseSource(liveA), phaseSource(liveB));
preference = { reduceMotion: true };
a.render(); assert.equal(timings[5].stopped, false, 'The second surface still owns its lease until it receives the preference');
const reducedB = b.render(); assert.equal(timings[5].stopped, true); assert.equal(phaseSource(reducedB).value, 0.5);
timings[5].callback({ finished: true }); assert.equal(timings.length, 6, 'A queued completion cannot restart after Reduced Motion released all leases');
a.stop(); b.stop();
console.log('PASS: actual Surface preference gate, shared reference, conservative initial still state, Reduced Motion change and queued-completion cleanup');

AppState.currentState = null;
const coldClock = load('lib/holographicMotion.js', { 'react-native': { AppState, Animated, Easing: { linear: 'linear' } }, '../theme/holographic': finish });
const beforeCold = timings.length; const releaseCold = coldClock.acquireHolographicMotion();
assert.equal(timings.length, beforeCold + 1, 'Unknown initial Android state must start the gradient');
stateListener('background'); assert.equal(timings.at(-1).stopped, true);
stateListener('active'); assert.equal(timings.length, beforeCold + 2, 'Returning to foreground resumes motion');
releaseCold();
console.log('PASS: Android unknown initial state and background recovery');
