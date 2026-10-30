const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), babel = require('@babel/core');
let active;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) { const h = active, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], value => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }]; },
  useRef(initial) { const h = active, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useEffect(fn, deps) { const h = active, i = h.cursor++; const old = h.slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) { h.effects.push(() => { old?.cleanup?.(); h.slots[i] = { deps, cleanup: fn() }; }); } },
};
const timers = new Map(), started = [], lifecycle = new Set();
const animation = (kind, options) => ({ kind, options, start(callback) { this.callback = callback; started.push(this); }, stop() { this.stopped = true; } });
const Animated = {
  View: 'AnimatedView',
  Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation() {} interpolate(value) { return { ...value, source: this }; } },
  timing: (value, options) => animation('timing', options),
  delay: duration => animation('delay', { duration }),
  sequence: steps => animation('sequence', steps),
};
const AppState = { currentState: 'active', addEventListener(event, callback) { assert.equal(event, 'change'); lifecycle.add(callback); return { remove: () => lifecycle.delete(callback) }; } }, Platform = { OS: 'ios' };
let dimensions = { width: 420, height: 900 };
let preferences = { reduceMotion: true, ready: false }, pulses = 0, hides = 0, done = 0;
const native = { Animated, AppState, Platform, View: 'View', Text: 'Text', useWindowDimensions: () => dimensions, Easing: { out: x => x, inOut: x => x, cubic: x => x }, StyleSheet: { create: x => x, absoluteFillObject: {}, absoluteFill: {} } };
const mocks = { react: React, 'react-native': native, 'expo-linear-gradient': { LinearGradient: 'Gradient' }, 'expo-haptics': { impactAsync: async () => { pulses++; }, ImpactFeedbackStyle: { Light: 'light' } }, 'expo-splash-screen': { hideAsync: async () => { hides++; } }, '../hooks/useMotionPreference': () => preferences, '../theme/tokens': { colors: {}, spacing: { xxl: 24, section: 32, xl: 20 } }, './BrandLogo': 'BrandLogo' };
function compile(file, injected) {
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text'; if (!(name in injected)) throw new Error(`Unexpected ${name}`); return injected[name]; }, setTimeout(fn, delay) { const key = { delay }; timers.set(key, fn); return key; }, clearTimeout: key => timers.delete(key), Promise });
  return module.exports.default;
}
const Launch = compile('components/BrandLaunch.js', mocks);
function harness(Component = Launch) {
  const h = { cursor: 0, slots: [], effects: [], ready: false };
  h.render = () => { active = h; h.cursor = 0; h.effects = []; const tree = Component({ ready: h.ready, onDone: () => done++ }); h.effects.forEach(effect => effect()); return tree; };
  h.stop = () => h.slots.forEach(slot => slot?.cleanup?.());
  return h;
}
function finish(kind) { const item = [...started].reverse().find(value => value.kind === kind && !value.stopped && !value.finished); assert.ok(item); item.finished = true; item.callback?.({ finished: true }); return item; }
function flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); }
function appState(value) { AppState.currentState = value; [...lifecycle].forEach(fn => fn(value)); }
function reset() { timers.clear(); started.length = 0; lifecycle.clear(); pulses = hides = done = 0; AppState.currentState = 'active'; Platform.OS = 'ios'; dimensions = { width: 420, height: 900 }; }
(async () => {
  reset(); preferences = { reduceMotion: true, ready: false };
  const h = harness(); const initial = h.render(); initial.props.onLayout(); initial.props.onLayout(); assert.equal(hides, 1); assert.equal(timers.size, 0);
  assert.equal(initial.props.children[1].props.children[0].type, 'BrandLogo');
  assert.equal(initial.props.children[1].props.children[0].props.variant, 'full', 'The full restored lockup remains readable before animation starts');
  preferences = { reduceMotion: false, ready: true }; h.render(); assert.equal(timers.size, 1);
  assert.equal([...timers.keys()][0].delay, 1700, 'The sole haptic is at the centre of the 400ms hold + 2600ms sweep');
  const sequence = started.find(item => item.kind === 'sequence');
  assert.equal(sequence.options[0].kind, 'delay'); assert.equal(sequence.options[0].options.duration, 400);
  assert.equal(sequence.options[1].options.duration, 2600);
  assert.equal(sequence.options.reduce((total, item) => total + item.options.duration, 0), 3000, 'An approximately three-second intro, not an arbitrary long loading delay');
  flushTimers(); assert.equal(pulses, 1); h.render(); assert.equal(timers.size, 0);
  finish('sequence'); const waiting = h.render(); assert.equal(done, 0, 'Launch must not expose the app before local hydration');
  assert.equal(waiting.props.children[2].props.children[0], 'Подготавливаем приложение…');
  h.ready = true; h.render(); const exit = finish('timing'); assert.equal(exit.options.duration, 300); h.render(); assert.equal(done, 1); h.render(); assert.equal(done, 1); h.stop(); assert.equal(lifecycle.size, 0);
  reset(); preferences = { reduceMotion: true, ready: true }; const reduced = harness(); reduced.ready = true; const still = reduced.render(); reduced.render(); assert.equal(still.props.children[0], false); assert.equal(started.some(x => x.kind === 'sequence'), false); assert.equal(timers.size, 0); assert.equal(finish('timing').options.duration, 0); assert.equal(done, 1); assert.equal(pulses, 0); reduced.stop();
  reset(); preferences = { reduceMotion: false, ready: true }; const background = harness(); background.render(); const intro = started[0]; appState('background'); assert.equal(timers.size, 0); assert.equal(intro.stopped, true); flushTimers(); assert.equal(pulses, 0); appState('active'); background.render(); assert.equal(started.length, 1, 'Returning from background must not replay the intro'); background.ready = true; background.render(); finish('timing'); assert.equal(done, 1); background.stop();
  reset(); AppState.currentState = 'background'; const hidden = harness(); hidden.render(); hidden.render(); assert.equal(timers.size, 0); assert.equal(started.length, 0, 'A background launch never schedules its effect or haptic'); hidden.stop();
  reset(); AppState.currentState = null; const unknown = harness(); unknown.render(); assert.equal(started.length, 1, 'An initially unknown native lifecycle must not skip the whole intro'); flushTimers(); assert.equal(pulses, 0, 'A haptic needs confirmed foreground state'); unknown.stop();
  reset(); Platform.OS = 'web'; const web = harness(); web.render(); assert.equal(timers.size, 0); flushTimers(); assert.equal(pulses, 0); web.stop();
  reset(); const stopped = harness(); stopped.render(); const stoppedIntro = started[0]; assert.equal(timers.size, 1); stopped.stop(); assert.equal(timers.size, 0); assert.equal(lifecycle.size, 0); stoppedIntro.callback({ finished: true }); flushTimers(); assert.equal(pulses, 0); assert.equal(done, 0);
  reset(); const changed = harness(); changed.render(); const oldIntro = started[0]; preferences = { reduceMotion: true, ready: true }; changed.render(); assert.equal(oldIntro.stopped, true); flushTimers(); assert.equal(pulses, 0); preferences = { reduceMotion: false, ready: true }; changed.render(); assert.equal(started.length, 1, 'Toggling motion back on must not replay launch'); assert.equal(changed.render().props.children[0].props.style[1].opacity.source.value, 1, 'A cancelled beam stays outside the screen after preferences change'); changed.stop();
  console.log('PASS: 3s intro + 300ms exit, one centred native pulse, stable full logo, hydration gate, Reduced Motion, background/web silence, no replay and cleanup');

  // Actual geometry, rather than a source string check: both rotated endpoints
  // are fully outside the viewport and the beam covers its complete height.
  reset(); preferences = { reduceMotion: false, ready: true };
  for (const frame of [{ width: 320, height: 640 }, { width: 420, height: 900 }, { width: 900, height: 420 }, { width: 1200, height: 800 }]) {
    dimensions = frame; const geometry = harness(); const tree = geometry.render();
    const band = tree.props.children[0], brand = tree.props.children[1];
    const bounds = band.props.style[1], logo = brand.props.children[0];
    const angle = parseFloat(bounds.transform[1].rotate) * Math.PI / 180;
    const halfWidth = (bounds.width * Math.cos(angle) + bounds.height * Math.sin(angle)) / 2;
    const halfHeight = (bounds.height * Math.cos(angle) + bounds.width * Math.sin(angle)) / 2;
    const centre = bounds.left + bounds.width / 2;
    const [start, end] = bounds.transform[0].translateX.outputRange;
    assert.ok(centre + start + halfWidth < 0, `Start must be beyond left edge at ${frame.width}x${frame.height}`);
    assert.ok(centre + end - halfWidth > frame.width, `End must be beyond right edge at ${frame.width}x${frame.height}`);
    assert.ok(halfHeight * 2 >= frame.height, 'The glow spans the complete screen height');
    assert.ok(bounds.width >= frame.width * 0.72, 'A broad screen glow, not a 96px logo highlight');
    assert.equal(logo.type, 'BrandLogo'); assert.equal(logo.props.variant, 'full'); assert.ok(logo.props.width <= frame.width - 64);
    assert.notEqual(band, brand.props.children[0], 'The beam is a fullscreen sibling, never clipped inside the logo');
    geometry.stop();
  }
  console.log('PASS: portrait, small phone, landscape and tablet beam coverage, offscreen endpoints and responsive full-logo size');
  let resolve, listener, removed = 0;
  const accessibility = { isReduceMotionEnabled: () => new Promise(value => { resolve = value; }), addEventListener: (_, callback) => { listener = callback; return { remove: () => removed++ }; } };
  const Motion = compile('hooks/useMotionPreference.js', { react: React, 'react-native': { AccessibilityInfo: accessibility } });
  const motion = harness(Motion); assert.equal(motion.render().reduceMotion, true); listener(true); resolve(false); await new Promise(value => setImmediate(value)); assert.equal(motion.render().reduceMotion, true, 'Late initial query cannot undo a newer system preference'); motion.stop(); assert.equal(removed, 1);
  console.log('PASS: motion preference is conservative, reacts to OS changes and rejects stale initial queries');
})().catch(error => { console.error(error); process.exitCode = 1; });
