const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), babel = require('@babel/core');
const load = require('./load-domain.cjs');
const present = load('lib/orderPresentation.js');
assert.equal(present.orderStatusPresentation('new').headline, 'Заказ отправлен');
assert.equal(present.orderStatusPresentation('ready').headline, 'Можно забирать');
assert.equal(present.orderStatusPresentation('completed').headline, 'Заказ выдан');
assert.equal(present.orderStatusPresentation(null).headline, 'Проверяем заказ');
assert.equal(present.orderStatusPresentation('unknown').headline, 'Проверяем заказ');
assert.equal(present.orderCashDue({ total: '100.50', bonus_redeemed: 20 }, { total: 999 }), 80.5);
assert.equal(present.orderCashDue(null, { total: 80, bonusRedeemed: 20 }), 80, 'history cash due is never debited twice');
assert.equal(present.orderCashDue({ total: 10, bonus_redeemed: 20 }, { total: 20 }), null);
assert.equal(present.orderCashDue(null, {}), null, 'absent money never becomes a fake zero price');
assert.equal(present.orderNumberLabel(null), null);
assert.equal(present.orderNumberLabel('№ 42'), '№42');
assert.match(present.orderPickupLabel({ pickup_at: '2026-10-29T05:00:00Z' }), /12:00/);
console.log('PASS: truthful status headlines, missing number/money and raw-vs-history bonus arithmetic');

const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
  memo: value => value, useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {},
};
const native = Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'FlatList', 'ScrollView', 'Pressable', 'ActivityIndicator'].map(name => [name, name]));
native.useWindowDimensions = () => ({ width: 420, height: 900 });
native.StyleSheet = { create: value => value }; native.Platform = { OS: 'web' };
const tokens = load('theme/tokens.js');
const shared = {
  react: React, 'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-haptics': {}, '../theme/tokens': tokens,
  '../data/products': { cartKey: id => id, formatPrice: value => `${value} ₽` },
};
function loadView(file, mocks) {
  const mod = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, Promise, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text'; if (name in mocks) return mocks[name]; throw new Error(`Unexpected view dependency: ${name}`); } });
  return mod.exports.default;
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)]; }
function tagged(tree, type) { return nodes(tree).find(node => node.type === type); }
function text(tree) { if (typeof tree === 'string' || typeof tree === 'number') return String(tree); return (tree?.props?.children || []).flat(Infinity).map(text).join(' '); }
const menu = loadView('screens/MenuScreen.js', {
  ...shared, '../components/QuickProductCard': 'ProductCard', '../components/EmptyState': 'EmptyState',
  '../lib/menuVisibility': load('lib/menuVisibility.js', {}, { URL }),
  '../components/ScreenHeader': 'ScreenHeader', '../components/Chip': 'Chip', '../components/PrimaryButton': 'PrimaryButton',
  '../lib/catalogService': { buildCategoryList: products => [...new Set(products.map(product => product.menuCategory))], buildSubcategoryList: (products, category) => [...new Set(products.filter(product => product.menuCategory === category).map(product => product.menuSubcategory))], collapseSizeVariants: products => products },
});
let retries = 0;
const props = { navigation: {}, tabBarHeight: 54, onRetryCatalog: () => { retries++; } };
let tree = menu({ ...props, products: [], catalogLoading: true });
let flat = tagged(tree, 'FlatList');
assert.ok(nodes(flat.props.ListEmptyComponent).some(node => node.props?.accessibilityLabel === 'Загружаем меню'));
assert.equal(tagged(flat.props.ListEmptyComponent, 'EmptyState'), undefined, 'loading has actual skeletons, not an error/empty message');
tree = menu({ ...props, products: [], catalogLoading: false });
assert.equal(tagged(tagged(tree, 'FlatList').props.ListEmptyComponent, 'EmptyState').props.title, 'Меню пока пусто');
tree = menu({ ...props, products: [], catalogError: new Error('offline') });
const empty = tagged(tagged(tree, 'FlatList').props.ListEmptyComponent, 'EmptyState');
assert.equal(empty.props.title, 'Не удалось загрузить меню');
empty.props.action.props.onPress(); assert.equal(retries, 1);
tree = menu({ ...props, products: [{ id: 'one', name: 'Кофе', menuCategory: 'Напитки', menuSubcategory: 'Кофе' }], catalogError: new Error('offline') });
assert.ok(tagged(tree, 'FlatList').props.data.length > 0, 'cached menu remains available after an update failure');
assert.match(text(tree), /Показаны ранее загруженные позиции/);
const retry = nodes(tree).find(node => node.props?.accessibilityLabel === 'Повторить обновление меню');
retry.props.onPress(); assert.equal(retries, 2);
console.log('PASS: real menu component skeleton/empty/error distinctions, cached rows and explicit retry action');

let statusValue;
const statusView = loadView('screens/OrderSuccessScreen.js', {
  ...shared, '../components/HoloRing': 'HoloRing', '../components/PrimaryButton': 'PrimaryButton',
  '../lib/orderPresentation': present, '../hooks/useOrderStatus': () => statusValue,
});
statusValue = { status: 'ready', orderNumber: 42, details: { total: 100, bonus_redeemed: 20, pickup_at: '2026-10-29T05:00:00Z', pickup_point: 'Ленина, 72', customer_name: 'Тест' }, error: new Error('offline'), refreshing: false, refresh: () => { retries++; } };
tree = statusView({ order: { supabaseOrderId: 'order-id', total: 999 } });
assert.match(text(tree), /Можно забирать/); assert.match(text(tree), /№42/); assert.match(text(tree), /80 ₽/);
assert.match(text(tree), /Не удалось обновить статус/);
nodes(tree).find(node => node.props?.accessibilityLabel === 'Обновить статус заказа').props.onPress(); assert.equal(retries, 3);
statusValue = { status: 'completed', details: { total: 100, bonus_redeemed: 20, paid_at: '2026-10-29T05:01:00Z' }, refresh: () => {} };
assert.match(text(statusView({ order: { supabaseOrderId: 'order-id' } })), /Оплачено/);
statusValue = { status: 'new', refresh: () => {} };
tree = statusView({ order: { total: 999, orderNumber: 'SBL-0000' } });
assert.match(text(tree), /Проверяем заказ/); assert.doesNotMatch(text(tree), /SBL-0000|999 ₽|Заказ принят/);
console.log('PASS: real status component shows current status, exact cash due, retry and no invented confirmed order');
