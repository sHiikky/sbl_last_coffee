const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const babel = require('@babel/core');
const load = require('./load-domain.cjs');
const phone = load('lib/phoneInput.js');
const ordering = load('lib/ordering.js', { './supabaseClient': {} });
const full = '+7 (999)-123-45-67';
for (const input of ['9991234567', '79991234567', '89991234567', '+7 (999) 123 45 67', '8 (999) 123-45-67', '+7  999   123  45  67']) {
  assert.equal(phone.formatPhoneInput(input), full, input);
  assert.equal(ordering.normalizeContactPhone(phone.formatPhoneInput(input)), '+79991234567');
  assert.equal(phone.completePhoneInput(phone.formatPhoneInput(input)), '+79991234567');
}
assert.equal(phone.formatPhoneInput('7771234567'), '+7 (777)-123-45-67', 'ten-digit national numbers may start with 7');
assert.equal(phone.formatPhoneInput('8881234567'), '+7 (888)-123-45-67', 'ten-digit national numbers may start with 8');
assert.equal(phone.formatPhoneInput('+79991234567890'), full, 'at most ten national digits');
assert.equal(phone.editPhoneInput(full, '+44 20 1234 5678', { start: 0, end: full.length }).text, full, 'foreign country paste cannot silently become a Russian number');
assert.equal(phone.formatPhoneInput(null), '');
let state = { text: '', selection: { start: 0, end: 0 } };
for (const digit of '89991234567') state = phone.editPhoneInput(state.text, state.text + digit, state.selection);
assert.equal(state.text, full, 'progressive typing with domestic country prefix');
for (let i = 0; state.text && i < 20; i++) {
  state = phone.editPhoneInput(state.text, state.text.slice(0, -1), { start: state.text.length, end: state.text.length });
}
assert.equal(state.text, '', 'repeated backspace clears the whole field');

const beforeHyphen = full.indexOf('-');
const afterHyphen = beforeHyphen + 1;
let edited = phone.editPhoneInput(full, full.slice(0, beforeHyphen) + full.slice(afterHyphen), { start: afterHyphen, end: afterHyphen });
assert.equal(phone.completePhoneInput(edited.text), null, 'backspace at a separator removes a real digit, so incomplete mask cannot pass as a ten-digit national number');
assert.equal(edited.text, '+7 (991)-234-56-7');
assert.equal(edited.selection.start, 6, 'backspace caret stays at the edited area code');
edited = phone.editPhoneInput(full, full.slice(0, beforeHyphen) + full.slice(afterHyphen), { start: beforeHyphen, end: beforeHyphen });
assert.equal(edited.text, '+7 (999)-234-56-7', 'forward delete at a separator removes the next real digit');
assert.equal(edited.selection.start, 7);
edited = phone.editPhoneInput(full, full.slice(0, 6) + '5' + full.slice(7), { start: 6, end: 7 });
assert.equal(edited.text, '+7 (995)-123-45-67', 'replacement in the middle preserves every untouched digit');
assert.equal(edited.selection.start, 7);
edited = phone.editPhoneInput(full, '9123456789', { start: 0, end: full.length });
assert.equal(edited.text, '+7 (912)-345-67-89');
assert.equal(edited.selection.start, edited.text.length);
assert.equal(phone.editPhoneInput(full, '', { start: 0, end: full.length }).text, '');
for (let length = 0; length < 10; length++) assert.equal(phone.completePhoneInput(phone.formatPhoneInput('+7' + '9'.repeat(length))), null, 'every partial mask is rejected before generic contact normalization');
console.log('PASS: phone formatting, country prefixes, full paste, digit limit, mid-number edit and separator deletion preserve intended digits/caret');

const root = path.resolve(__dirname, '..');
const code = babel.transformSync(fs.readFileSync(path.join(root, 'screens/CartScreen.js'), 'utf8'), {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'],
}).code;
const states = [], refs = [], effects = []; let stateIndex = 0, refIndex = 0;
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children }; },
  useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
  useRef(initial) { const i = refIndex++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i]; },
  useEffect(fn, dependencies) { if (dependencies?.length === 2) effects.push(fn); },
};
const native = { Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 390 }), StyleSheet: { create: value => value }, Alert: { alert() {} } };
for (const name of ['View','Text','TextInput','TouchableOpacity','FlatList','ScrollView','KeyboardAvoidingView']) native[name] = name;
const mocks = {
  react: { __esModule: true, default: React, ...React }, 'react-native': native,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  'expo-haptics': {}, '@expo/vector-icons': { Ionicons: 'Icon' },
  '../theme/tokens': { colors: {}, spacing: {}, radius: {}, shadow: {}, getHorizontalPadding: () => 16 },
  '../data/products': { PICKUP_TIMES: ['Скоро'], PICKUP_POINTS: ['SBL'], formatPrice: String, cartKey: String },
  '../loyalty/loyaltyService': { getAvailableRewards: () => [], isRewardApplicable: () => false, getEligibleCartItemsForReward: () => [] },
  '../lib/supabaseClient': {}, '../lib/checkoutQuote': { money: value => value }, '../lib/orderService': {},
  '../hooks/useBonusAccount': { __esModule: true, default: () => ({ balance: 0, lifetimePaid: 0 }) },
  '../lib/bonusConfig': { getBonusLevel: () => ({ rate: .05 }), maxRedeemable: () => 0 },
  '../lib/ordering': { orderingState: () => ({ isOpen: true }) }, '../lib/cartOptions': { formatAdditions: () => '' },
  '../lib/phoneInput': phone,
};
const moduleObject = { exports: {} };
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports, console, Date, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text';
  if (Object.hasOwn(mocks, name)) return mocks[name];
  if (name.startsWith('../components/')) return { __esModule: true, default: name };
  throw new Error('Unexpected phone input dependency: ' + name);
} });
let account = { id: 'signed-in' };
function findPhone(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.accessibilityLabel === 'Телефон для связи') return node;
  for (const value of (Array.isArray(node) ? node : Object.values(node))) { const found = findPhone(value); if (found) return found; }
  return null;
}
function render() {
  stateIndex = 0; refIndex = 0; effects.length = 0;
  return findPhone(moduleObject.exports.default({ navigation: {}, cart: { coffee: { id: 'coffee', qty: 1, unitPrice: 100 } }, account }));
}
let input = render();
assert(input);
assert.equal(input.props.placeholder, phone.PHONE_INPUT_PLACEHOLDER);
assert.equal(input.props.editable, true);
input.props.onChangeText('8 (999) 123 45 67');
input = render();
assert.equal(input.props.value, full, 'actual cart input formats pasted value');
assert.equal(input.props.selection.start, full.length);
input.props.onSelectionChange({ nativeEvent: { selection: { start: 6, end: 7 } } });
input.props.onChangeText(full.slice(0, 6) + '5' + full.slice(7));
input = render();
assert.equal(input.props.value, '+7 (995)-123-45-67');
assert.equal(input.props.selection.start, 7);
account = { id: 'confirmed', phone: '+79991234567' };
render(); effects[0](); input = render();
assert.equal(input.props.value, full, 'verified phone gets the same presentation');
assert.equal(input.props.editable, false, 'verified account contact remains immutable');
account = { id: 'another-account' };
render(); effects[0](); input = render();
assert.equal(input.props.value, '', 'account change resets the formatted contact rather than retaining a previous owner');
account = null;
assert.equal(render(), null, 'guest sees the login prompt, never the checkout contact form');
console.log('PASS: actual cart TextInput handlers format, track caret, show locked verified numbers and reset on account change');
