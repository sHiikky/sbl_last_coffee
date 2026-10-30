const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const babel = require('@babel/core');
const load = require('./load-domain.cjs');
const { groupModifiers, modifierGroupId } = load('lib/modifierGroups.js');
const additions = [
  { id: 'm100', name: '-молоко альтер. 100 мл', price: 40 },
  { id: 's', displayName: 'Сироп', price: 30 },
  { id: 'paste', name: 'Паста арахисовая', price: 30 },
  { id: 'm50', name: 'Молоко', price: 20 },
  { id: 'cream', name: 'Сливки', price: 25 },
  { id: 'unknown', name: 'Новая добавка', price: 15 },
];
const groups = groupModifiers(additions);
assert.deepEqual(Array.from(groups, group => group.id), ['milk', 'syrup', 'other']);
assert.deepEqual(Array.from(groups[0].items, item => item.id), ['m100', 'm50', 'cream']);
assert.deepEqual(Array.from(groups[2].items, item => item.id), ['paste', 'unknown']);
assert.equal(groups.flatMap(group => group.items).length, additions.length, 'every SKU stays selectable');
for (const group of groups) for (const item of group.items) assert.strictEqual(item, additions.find(row => row.id === item.id), 'classification must not rewrite prices/UUIDs');
assert.equal(modifierGroupId({ name: 'СИРОП 10мл' }), 'syrup');
assert.equal(modifierGroupId({ name: 'Миндальный урбеч' }), 'other', 'not every nut ingredient is milk');
assert.equal(groupModifiers([]).length, 0);
console.log('PASS: modifiers grouped without removing unknown/duplicate-name SKUs or changing recipes/prices');

const root = path.resolve(__dirname, '..');
const code = babel.transformSync(fs.readFileSync(path.join(root, 'screens/CartScreen.js'), 'utf8'), {
  babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'],
}).code;
const states = []; let stateIndex = 0;
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children }; },
  useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
  useRef: value => ({ current: value }), useEffect() {},
};
const native = { Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 360 }), StyleSheet: { create: value => value }, Alert: { alert() {} } };
for (const name of ['View','Text','TextInput','TouchableOpacity','FlatList','ScrollView','KeyboardAvoidingView']) native[name] = name;
const mocks = {
  react: { __esModule: true, default: React, ...React }, 'react-native': native,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 34 }) },
  'expo-haptics': { selectionAsync: async () => {}, notificationAsync: async () => {}, NotificationFeedbackType: {} },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '../theme/tokens': { colors: {}, spacing: { xs: 4, sm: 8, md: 12, lg: 16 }, radius: {}, shadow: {}, getHorizontalPadding: () => 16 },
  '../data/products': { PICKUP_TIMES: ['Через 3–5 минут'], PICKUP_POINTS: ['SBL · Ленина, 72'], formatPrice: value => value + ' ₽', cartKey: String },
  '../loyalty/loyaltyService': { getAvailableRewards: () => [], isRewardApplicable: () => false, getEligibleCartItemsForReward: () => [] },
  '../lib/supabaseClient': { getUserOrThrow: async () => ({ id: 'guest' }) },
  '../lib/checkoutQuote': { money: value => Math.round(value * 100) / 100 },
  '../lib/orderService': {},
  '../hooks/useBonusAccount': { __esModule: true, default: () => ({ balance: 0, lifetimePaid: 0 }) },
  '../lib/bonusConfig': { getBonusLevel: () => ({ rate: 0.05 }), maxRedeemable: () => 0 },
  '../lib/ordering': { CAFE: { pointId: 'lenina-72' }, orderingState: () => ({ isOpen: true }) },
  '../lib/cartOptions': { formatAdditions: () => '' },
  '../lib/phoneInput': load('lib/phoneInput.js'),
};
const moduleObject = { exports: {} };
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports, console, Date, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text';
  if (Object.hasOwn(mocks, name)) return mocks[name];
  if (name.startsWith('../components/')) return { __esModule: true, default: name };
  throw new Error('Unexpected Cart UX dependency: ' + name);
} });
const coffee = { id: 'coffee', key: 'coffee', name: 'Длинное название любимого напитка', qty: 2, unitPrice: 100 };
const navigationCalls = [];
const props = { navigation: { navigate: (...args) => navigationCalls.push(args) }, cart: { coffee }, tabBarHeight: 88, onIncrement() {}, onDecrement() {}, products: [] };
function render() { stateIndex = 0; return moduleObject.exports.default(props); }
function all(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const value of (Array.isArray(node) ? node : Object.values(node))) all(value, predicate, found);
  return found;
}
const isCheckout = node => node.props?.fullWidth && node.props?.haptic === 'success';
let tree = render();
const list = all(tree, node => node.type === 'FlatList')[0];
assert.equal(all(tree, isCheckout).length, 1, 'one persistent checkout action');
assert.equal(all(list, isCheckout).length, 0, 'checkout must remain outside scrolling list/footer');
const row = list.props.renderItem({ item: coffee });
assert.equal(all(row, node => node.type === 'Text' && node.children.includes(coffee.name))[0].props.numberOfLines, 2, 'long cart names get two lines');
assert.equal(all(tree, node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Текст комментария к заказу').length, 0, 'optional comment initially collapsed');
all(tree, node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Комментарий к заказу')[0].props.onPress();
tree = render();
all(tree, node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Текст комментария к заказу')[0].props.onChangeText('Без трубочки');
tree = render();
all(tree, node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Комментарий к заказу')[0].props.onPress();
tree = render();
all(tree, node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Комментарий к заказу')[0].props.onPress();
tree = render();
assert.equal(all(tree, node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Текст комментария к заказу')[0].props.value, 'Без трубочки', 'collapsing comment preserves user text');
all(tree, node => node.props?.accessibilityLabel === 'Показать кофейню на карте')[0].props.onPress();
assert.equal(navigationCalls[0][0], 'CafeLocation');
assert.equal(all(tree, node => node.type === 'Text' && node.children.includes('200 ₽')).length >= 1, true, 'persistent total reflects cart amount');
console.log('PASS: checkout outside scroll, two-line names, sole pickup info/map action and lossless comment collapse');
