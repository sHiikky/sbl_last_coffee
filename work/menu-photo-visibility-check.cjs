const assert = require('node:assert/strict');
const load = require('./load-domain.cjs');
const { hasProductPhoto, selectMenuProducts, resolveSubcategoryFilter } = load('lib/menuVisibility.js', {}, { URL });
const catalog = load('lib/catalogService.js', {
  './supabaseClient': {}, './menuLookup': { getMenuInfo: () => null },
});
const photo = { uri: 'https://example.com/product.webp' };
for (const image of [null, undefined, {}, { uri: '' }, { uri: ' ' }, { uri: '/local.png' },
  { uri: 'not a URL' }, { uri: 'javascript:alert(1)' }, { uri: 'file:///tmp/a.png' },
  { uri: 'https://api.sbis.ru/img?params=old' }, { uri: 'https://API.SBIS.RU/img/' }, 0]) {
  assert.equal(hasProductPhoto({ image }), false, JSON.stringify(image));
}
assert.equal(hasProductPhoto({ image: photo }), true);
assert.equal(hasProductPhoto({ image: { uri: 'https://example.com/render?id=1' } }), true);
assert.equal(hasProductPhoto({ image: 42 }), true);
const products = [
  { id: 'small-no-photo', displayName: 'Латте', sizeLabel: '200 мл', menuCategory: 'Напитки', menuSubcategory: 'Кофе' },
  { id: 'large-photo', displayName: 'Латте', sizeLabel: '400 мл', menuCategory: 'Напитки', menuSubcategory: 'Кофе', image: photo },
  { id: 'tea', menuCategory: 'Напитки', menuSubcategory: 'Чай' },
  { id: 'cake', menuCategory: 'Десерты', menuSubcategory: 'Шу' },
  { id: 'roti', menuCategory: 'Еда', menuSubcategory: 'Сэндвичи', image: photo },
  { id: 'modifier', isModifier: true, image: photo },
  { id: 'stopped', isAvailable: false, menuCategory: 'Магазин', image: photo },
];
const menu = selectMenuProducts(products);
assert.equal(menu.map(p => p.id).join(','), 'large-photo,roti');
assert.equal(catalog.buildCategoryList(menu).join(','), 'Напитки,Еда');
assert.equal(catalog.buildSubcategoryList(menu, 'Напитки').join(','), 'Кофе');
assert.equal(catalog.collapseSizeVariants(menu)[0].id, 'large-photo');
assert.equal(resolveSubcategoryFilter(['Кофе'], 'Чай'), 'all');
assert.equal(resolveSubcategoryFilter([], 'Чай'), 'all');
assert.equal(resolveSubcategoryFilter(['Кофе'], 'Кофе'), 'Кофе');
assert.equal(selectMenuProducts(products.filter(p => p.id !== 'large-photo')).map(p => p.id).join(','), 'roti');
assert.equal(catalog.buildCategoryList([]).length, 0);
assert.equal(products.length, 7); // Complete ordering catalog is not mutated.
assert.equal(products[5].isModifier, true);
const fs = require('node:fs'), path = require('node:path');
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/menu-photo-catalog.json')));
const current = snapshot.rows.filter(p => p.is_visible && p.is_available && !p.is_modifier).map(row => ({
  ...row, isModifier: row.is_modifier, image: { uri: row.image_override_url || row.image_url },
  menuCategory: row.menu_category, menuSubcategory: row.menu_subcategory,
}));
const shown = selectMenuProducts(current);
assert(shown.length > 0 && shown.length < current.length);
assert(shown.every(p => hasProductPhoto(p)));
assert(catalog.buildCategoryList(shown).every(c => shown.some(p => p.menuCategory === c)));
console.log(`PASS: photo-only discovery, broken SBIS links, empty categories/subcategories, remaining size, filter reset, catalog preservation; snapshot ${current.length} -> ${shown.length} rows`);
