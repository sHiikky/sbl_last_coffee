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
  '../lib/promoCodes': {quotePromo:async()=>({discount:10,code:'TEST'}),promoMessage:()=> 'Промокод недействителен'},
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
const props = { navigation: { navigate: (...args) => navigationCalls.push(args) }, account: { id: 'user' }, cart: { coffee }, tabBarHeight: 88, onIncrement() {}, onDecrement() {}, products: [] };
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

// Реальный вид добавок каталога: объём срезан из displayName в sizeLabel (toAppProduct).
{
  const { presentAdditions, additionTitle } = load('lib/additionsPresentation.js');
  const row = (id, name, displayName, price) => ({ id, name, displayName, price, isAvailable: true, isModifier: true });
  const catalog = [
    row('c2', '-молоко кокосовое 200 мл', 'молоко кокосовое', 120), row('c3', '-молоко кокосовое 300 мл', 'молоко кокосовое', 120),
    row('a3', '-молоко миндальное 300 мл', 'молоко миндальное', 120), row('l3', '-молоко безлактозное 300мл', 'молоко безлактозное', 120),
    row('alt', '-молоко альтер. 100 мл', 'молоко альтер.', 60), row('m100', 'Молоко 100мл.', 'Молоко', 50), row('m50', 'Молоко 50 мл', 'Молоко', 25),
    row('syr', 'Сироп 10 мл', 'Сироп', 30), row('tea', 'Чай 6 гр', 'Чай', 100), row('ice', 'Мороженое 50гр', 'Мороженое', 100),
    row('caviar', '+икра лососевая 25 гр', '+икра лососевая', 450), row('butter', '+масло 20 гр', '+масло', 50),
  ];
  const names = list => Array.from(list, item => item.displayName);
  const drink = presentAdditions({ menuCategory: 'Напитки', sizeLabel: '300 мл' }, catalog);
  assert.deepEqual(names(drink), ['Кокосовое молоко', 'Миндальное молоко', 'Безлактозное молоко', 'Молоко', 'Сироп']);
  assert.equal(drink[0].id, 'c3', 'volume SKU follows the drink size');
  assert.equal(presentAdditions({ menuCategory: 'Напитки', sizeLabel: '200 мл' }, catalog)[0].id, 'c2');
  assert(drink.slice(0, 3).every(item => item.altMilk) && !drink.slice(3).some(item => item.altMilk));
  assert(!drink.some(item => ['caviar', 'butter', 'tea', 'alt', 'm50'].includes(item.id)), 'no food additions, tea or duplicate milk on drinks');
  assert.deepEqual(names(presentAdditions({ menuCategory: 'Еда' }, catalog)), ['Икра лососевая', 'Масло'], 'food gets only food additions, never milk or syrup');
  assert.deepEqual(names(presentAdditions({ menuCategory: 'Десерты' }, catalog)), ['Мороженое']);
  assert.equal(presentAdditions({ menuCategory: null }, catalog).length, 0);
  assert.equal(presentAdditions({ menuCategory: 'Магазин' }, catalog).length, 0);
  assert.equal(additionTitle(catalog[1]), 'Кокосовое молоко');
  assert.equal(additionTitle(catalog[10]), 'Икра лососевая');
    const full = [...catalog, row('honey', 'Мед 20гр', 'Мед', 45), row('marsh', 'Маршеллоу порц 25гр', 'Маршеллоу порц', 75), row('ginger', 'Имбирный фреш 15 мл', 'Имбирный фреш', 50), row('soda', 'Содовая 100 мл', 'Содовая', 30), row('peanut', 'Паста арахисовая 20гр.', 'Паста арахисовая', 50), row('cardamom', 'Кардамон/Можжевельник 2 гр', 'Кардамон/Можжевельник', 30), row('cream', 'Сливки 50мл.', 'Сливки', 50), row('cocoaPowder', '-какао порошок EXTRA BRUTE 5 гр', 'какао порошок EXTRA BRUTE', 50)];
  const ids = (menuSubcategory, name) => Array.from(presentAdditions({ menuCategory: 'Напитки', menuSubcategory, displayName: name, sizeLabel: '300 мл' }, full), item => item.id);
  assert(!ids('Кофе', 'Латте').includes('marsh') && !ids('Кофе', 'Латте').includes('tea') && !ids('Кофе', 'Латте').includes('caviar'), 'no marshmallow, tea or food on coffee');
  assert(!ids('Кофе', 'Латте').includes('cocoaPowder'), 'no cocoa powder in latte');
  assert.deepEqual(ids('Кофе', 'Эспрессо'), ['syr', 'cardamom'], 'black coffee: syrup and cardamom only');
  assert(ids('Какао и альтернативы', 'Какао').includes('marsh') && ids('Какао и альтернативы', 'Какао').includes('ice'), 'cocoa gets marshmallow and ice cream');
  assert.deepEqual(ids('Авторский кофе', 'Эспрессо-тоник'), ['syr', 'ginger', 'soda'], 'sour coffee: no milk');
  assert(!ids('Авторские без кофе', 'Лимонад розовый лимон').some(id => ['c3', 'a3', 'l3', 'm100', 'ice'].includes(id)), 'lemonade: no milk or ice cream');
  assert.deepEqual(ids('Чай и травяные', 'Чай черный'), ['honey', 'ginger', 'cardamom'], 'tea: honey, ginger, cardamom');
  assert.equal(ids('Кофе в зёрнах', 'Кофе 250 г').length, 0, 'beans: no additions');
console.log('PASS: additions on real catalog rows - one alt milk per kind by drink size, no food additions on drinks, no milk/syrup on food');
}
