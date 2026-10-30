const assert = require('node:assert/strict');
const load = require('./load-domain.cjs');
const empty = require('../data/photo-compositions.json');
const { getPhotoComposition, validPhotoFrame, photoTranslation } = load('lib/photoComposition.js', { '../data/photo-compositions.json': empty });
const product = { id: 'coffee-1', image: { uri: 'https://example.com/latte.png' } };
const detail = { fit: 'contain', zoom: 0.8, offsetX: 10, offsetY: -20 };
const card = { fit: 'cover', zoom: 1.2, offsetX: -5, offsetY: 0 };
const manifest = { ...empty, products: [{ id: product.id, sourceUrl: product.image.uri, detail, card }] };
assert.equal(getPhotoComposition(product).zoom, 0.9, 'tall detail image has breathing room by default');
assert.equal(getPhotoComposition(product, 'card').zoom, 1, 'existing menu composition stays unchanged');
assert.equal(JSON.stringify(getPhotoComposition(product, 'detail', manifest)), JSON.stringify(detail));
assert.equal(JSON.stringify(getPhotoComposition(product, 'card', manifest)), JSON.stringify(card));
assert.equal(getPhotoComposition({ ...product, image: { uri: 'https://example.com/new.png' } }, 'detail', manifest).zoom, 0.9, 'replaced image invalidates old composition');
assert.equal(getPhotoComposition({ ...product, id: 'other' }, 'detail', manifest).zoom, 0.9, 'settings never match by a similar name');
assert.equal(getPhotoComposition(product, 'detail', { ...manifest, version: 2 }).zoom, 0.9);
assert.equal(getPhotoComposition(product, 'detail', { ...manifest, projectRef: 'other-project' }).zoom, 0.9);
assert.equal(getPhotoComposition(product, 'detail', { ...manifest, products: [...manifest.products, ...manifest.products] }).zoom, 0.9, 'ambiguous IDs are rejected');
for (const bad of [null, { ...detail, zoom: NaN }, { ...detail, zoom: 0 }, { ...detail, offsetX: 36 }, { ...detail, offsetY: -36 }, { ...detail, fit: 'fill' }]) {
  assert.equal(validPhotoFrame(bad), false);
  assert.equal(getPhotoComposition(product, 'detail', { ...manifest, products: [{ ...manifest.products[0], detail: bad }] }).zoom, 0.9);
}
assert.equal(JSON.stringify(photoTranslation(detail, { width: 400, height: 420 })), JSON.stringify({ x: 40, y: -84 }), 'offsets use frame dimensions and are not multiplied by zoom');
assert.equal(JSON.stringify(photoTranslation(detail, null)), JSON.stringify({ x: 0, y: 0 }));
// Exercise the real image component's load/error callbacks across source changes.
// A failed old image must not permanently hide a new photo or win an A -> B -> A race.
const babel = require('@babel/core'), fs = require('node:fs'), vm = require('node:vm');
let slots = [], cursor = 0, effects = [], dirty = false;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  Fragment: 'Fragment',
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (next !== slots[i]) { slots[i] = next; dirty = true; } }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((dep, j) => dep !== slots[i][j])) { slots[i] = deps; effects.push(fn); } },
};
const native = { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: x => x, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute' } } };
const mocks = { react: React, 'react-native': native, 'expo-image': { Image: 'ExpoImage' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' }, '@expo/vector-icons': { Ionicons: 'Icon' }, '../theme/tokens': { colors: {} }, './HolographicSurface': { default: 'HolographicSurface' }, './BrandLogo': { default: 'BrandLogo' }, '../lib/photoComposition': { photoTranslation } };
const imageModule = { exports: {} };
const imageCode = babel.transformSync(fs.readFileSync('components/ProductImage.js', 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
vm.runInNewContext(imageCode, { module: imageModule, exports: imageModule.exports, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text'; if (!(name in mocks)) throw new Error(`Unexpected image dependency ${name}`); return mocks[name]; } });
function render(source) {
  let tree;
  for (let i = 0; i < 5; i++) { cursor = 0; effects = []; dirty = false; tree = imageModule.exports.default({ source: { uri: source } }); effects.forEach(effect => effect()); if (!dirty) return tree; }
  throw new Error('Image render did not settle');
}
function findImage(tree) { if (tree?.type === 'ExpoImage') return tree; for (const child of tree?.props?.children?.flat(Infinity) || []) { if (child && typeof child === 'object') { const found = findImage(child); if (found) return found; } } return null; }
const oldA = findImage(render('https://example.com/a.png'));
oldA.props.onError();
assert.equal(findImage(render('https://example.com/a.png')), null, 'failed source shows placeholder');
assert.ok(findImage(render('https://example.com/b.png')), 'a different source recovers from an earlier failure');
const newA = findImage(render('https://example.com/a.png'));
oldA.props.onError();
assert.ok(findImage(render('https://example.com/a.png')), 'late original A callback cannot fail the new A request');
newA.props.onError();
assert.equal(findImage(render('https://example.com/a.png')), null, 'current request errors still show a fallback');
console.log('PASS: product photo defaults, separate views, URL/UUID binding, invalid imports and frame translation');
console.log('PASS: real image source recovery and late A/B/A error protection');
