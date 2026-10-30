const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), babel = require('@babel/core');
let active;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) { const h = active, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], value => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }]; },
  useRef(initial) { const h = active, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useEffect(fn, deps) { const h = active, i = h.cursor++; const old = h.slots[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) h.effects.push(() => { old?.cleanup?.(); h.slots[i] = { deps, cleanup: fn() }; }); },
};
const timers = new Map(), animations = [], listeners = new Set();
const AppState = { currentState: 'active', addEventListener(event, callback) { assert.equal(event, 'change'); listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
const native = {
  View: 'View', Text: 'Text', TouchableOpacity: 'Touch',
  StyleSheet: { create: value => value, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 0.5 },
  AppState, Easing: { inOut: value => value, cubic: 'cubic' },
  Animated: {
    View: 'AnimatedView',
    Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate(options) { return { source: this, ...options }; } },
    timing(value, options) { const animation = { value, options, start() { animations.push(this); }, stop() { this.stopped = true; } }; return animation; },
  },
};
function compile(file, mocks) {
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text'; assert.ok(name in mocks, name); return mocks[name]; }, setTimeout(fn, delay) { const key = { delay }; timers.set(key, fn); return key; }, clearTimeout: key => timers.delete(key) });
  return module.exports;
}
function harness(Component, props) {
  const h = { slots: [], props };
  h.render = () => { active = h; h.cursor = 0; h.effects = []; const tree = Component(h.props); h.effects.forEach(effect => effect()); return tree; };
  h.stop = () => h.slots.forEach(slot => slot?.cleanup?.());
  return h;
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)]; }
const flatStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const compact = value => String(value).replace(/\s/g, '');
const text = tree => nodes(tree).filter(node => node.type === 'Text').flatMap(node => node.props.children).filter(value => typeof value === 'string' || typeof value === 'number').map(String);
const material = compile('theme/satinCard.js', {}).satinCard;
let focused = true, info = 0, feedback = 0;
const Card = compile('components/HomeLoyaltyCard.js', {
  react: React, 'react-native': native, '@react-navigation/native': { useIsFocused: () => focused },
  'expo-linear-gradient': { LinearGradient: 'Gradient' }, 'expo-haptics': { selectionAsync: async () => { feedback++; } },
  './BrandLogo': 'BrandLogo', './LoyaltyCardSheen': 'Sheen', '../theme/satinCard': { satinCard: material },
}).default;
const card = harness(Card, { bonuses: 1280, rate: 0.1, level: 2, toNextLevel: 8720, progress: 0.128, onPressInfo: () => info++ });
const view = card.render(), elements = nodes(view);
assert.ok(text(view).some(value => compact(value) === '1280'), 'Balance comes from props, not prototype demo data');
assert.ok(text(view).some(value => compact(value) === '8720₽до3уровня'));
const value = elements.find(node => node.type === 'Text' && compact(node.props.children[0]) === '1280');
assert.equal(flatStyle(value.props.style).fontWeight, '900'); assert.equal(flatStyle(value.props.style).fontSize, 67);
const rate = elements.find(node => node.type === 'Text' && node.props.children[0] === 10); assert.ok(rate, 'Cashback uses the real rate');
const logo = elements.find(node => node.type === 'BrandLogo'); assert.equal(logo.props.width, 90); assert.equal(logo.props.variant, 'mark'); assert.equal(logo.props.tone, 'dark');
const track = elements.find(node => node.props.accessibilityRole === 'progressbar');
assert.equal(track.props.accessibilityValue.now, 13); assert.equal(flatStyle(track.props.children[1].props.style).width, '12.8%');
const button = elements.find(node => node.type === 'Touch'); assert.ok(flatStyle(button.props.style).minHeight >= 44); button.props.onPress(); assert.equal(info, 1); assert.equal(feedback, 1);
assert.equal(elements.find(node => node.type === 'Sheen').props.enabled, true);
focused = false; assert.equal(nodes(card.render()).find(node => node.type === 'Sheen').props.enabled, false, 'Hidden navigation route disables the sheen');
card.props = { bonuses: 0, rate: 0.05, level: 1, toNextLevel: 10000, progress: 0 };
const zeroTrack = nodes(card.render()).find(node => node.props.accessibilityRole === 'progressbar');
assert.equal(flatStyle(zeroTrack.props.children[1].props.style).width, '0%'); assert.equal(flatStyle(zeroTrack.props.children[0].props.style).opacity, 0.28, 'Zero progress has only the muted decorative track');
for (const [progress, expected] of [[-1, 0], [2, 100], [NaN, 0]]) {
  card.props = { ...card.props, progress }; const current = nodes(card.render()).find(node => node.props.accessibilityRole === 'progressbar');
  assert.equal(current.props.accessibilityValue.now, expected); assert.equal(flatStyle(current.props.children[1].props.style).width, `${expected}%`);
}
card.props = { bonuses: 70, rate: 0.15, level: 3, toNextLevel: null, progress: 1 };
const max = nodes(card.render()).find(node => node.props.accessibilityRole === 'progressbar');
assert.equal(max.props.accessibilityValue.text, 'Максимальный уровень'); assert.equal(max.props.accessibilityValue.now, 100);
console.log('PASS: selected satin layout, real balance/rate/level/next target, truthful zero/partial/max fill, bounded progress and accessible Info');

let preference = { reduceMotion: false };
const Sheen = compile('components/LoyaltyCardSheen.js', {
  react: React, 'react-native': native, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
  '../hooks/useMotionPreference': () => preference, '../theme/satinCard': { satinCard: material },
}).default;
function fire() { const [key, callback] = timers.entries().next().value; timers.delete(key); callback(); return key.delay; }
function state(value) { AppState.currentState = value; [...listeners].forEach(fn => fn(value)); }
const sheen = harness(Sheen, { width: 380, height: 249, enabled: true });
const shine = sheen.render(); assert.equal(timers.size, 1); assert.equal([...timers.keys()][0].delay, 1500); assert.equal(animations.length, 0);
const geometry = flatStyle(shine.props.style), shear = Math.tan(20 * Math.PI / 180) * geometry.height / 2;
const [start, end] = geometry.transform[0].translateX.outputRange;
assert.ok(geometry.left + start + geometry.width + shear < 0); assert.ok(geometry.left + end - shear > 380);
assert.equal(fire(), 1500); assert.equal(animations.length, 1); assert.equal(animations[0].options.duration, 3000); assert.equal(animations[0].options.isInteraction, false);
assert.equal([...timers.keys()][0].delay, 18000, 'Next sweep starts 18s after this one, with true idle time');
const queued = [...timers.values()][0]; sheen.props.enabled = false; assert.equal(sheen.render(), null);
assert.equal(timers.size, 0); assert.equal(animations[0].stopped, true); queued(); assert.equal(animations.length, 1, 'A queued idle callback cannot restart after blur');
sheen.props.enabled = true; sheen.render(); assert.equal(timers.size, 1);
state('background'); assert.equal(sheen.render(), null); assert.equal(timers.size, 0);
state('active'); sheen.render(); assert.equal(timers.size, 1); fire(); assert.equal(animations.length, 2);
preference = { reduceMotion: true }; assert.equal(sheen.render(), null); assert.equal(timers.size, 0); assert.equal(animations[1].stopped, true);
preference = { reduceMotion: false }; sheen.render(); assert.equal(timers.size, 1);
// A lifecycle change is also checked in the timer, even before React flushes.
AppState.currentState = 'background'; fire(); assert.equal(animations.length, 2); assert.equal(timers.size, 0);
sheen.stop(); assert.equal(listeners.size, 0);
console.log('PASS: 3s pass/18s interval, off-card geometry, first delay, navigation blur, background, Reduced Motion, queued callbacks and listener cleanup');
