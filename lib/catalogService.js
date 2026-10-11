// lib/catalogService.js
// Загружает актуальное меню (товары и цены) из Supabase — таблица `products`
// синхронизируется из СБИС отдельной Edge Function, которую нужно один раз
// развернуть в проекте Supabase (см. "Claude outputs/supabase-products-schema.sql"
// и "Claude outputs/sync-sbis-catalog.ts"). Приложение НИКОГДА не обращается к
// СБИС напрямую и не хранит его ключи — это сознательное архитектурное решение
// (ключ СБИС не должен жить в мобильном клиенте).
import { supabase } from './supabaseClient';
import { getMenuInfo, findUnmatchedMenuItems } from './menuLookup';

const SBIS_IMAGE_HOST = 'https://api.sbis.ru';

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  return imageUrl.startsWith('http') ? imageUrl : `${SBIS_IMAGE_HOST}${imageUrl}`;
}

// Названия позиций в СБИС часто заканчиваются объёмом/весом ("Чай 500 мл",
// "Тирамису 180 г") — это удобно в СБИС, но на карточке товара выглядит
// загромождённо (см. референс "Вкусно и точка": в названии только сам
// продукт, объём — отдельной мелкой подписью). Здесь аккуратно отделяем
// это окончание от названия, если оно есть; если паттерн не подошёл —
// просто отдаём название как есть, ничего не теряя.
const SIZE_SUFFIX_RE = /[\s,(]*([\d]+[.,]?[\d]*\s?(?:мл|л|г|гр|кг))\.?\)?\s*$/i;
// Некоторые позиции СБИС кодируют размер словом, а не объёмом
// ("Кофе Капучино маленький", "Кофе Латте большой") — отделяем и это тоже.
const SIZE_WORD_RE = /\s+(маленький|маленькая|большой|большая|средний|средняя)\s*$/i;

export function splitNameAndSize(rawName) {
  const name = (rawName || '').trim();
  const wordMatch = name.match(SIZE_WORD_RE);
  if (wordMatch) {
    const displayName = name.slice(0, wordMatch.index).trim();
    return displayName ? { displayName, sizeLabel: wordMatch[1] } : { displayName: name, sizeLabel: null };
  }
  const match = name.match(SIZE_SUFFIX_RE);
  if (!match) return { displayName: name, sizeLabel: null };
  const displayName = name.slice(0, match.index).replace(/[\s,]+$/, '').trim();
  const sizeLabel = match[1].trim();
  // Если после отделения объёма от названия ничего не осталось (например,
  // само название товара — это просто "500 мл") — лучше показать как было,
  // чем оставить пустую строку.
  return displayName ? { displayName, sizeLabel } : { displayName: name, sizeLabel: null };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// КБЖУ лежит в raw_payload.attributes (calories/protein/fat/carbohydrate),
// но в СБИС заполнено лишь у части позиций (в основном еда и десерты). Чтобы
// не показывать полупустой блок вроде «0 ккал, —, —, —», нужны минимум три
// значения из четырёх. Выдуманных значений нет: чего нет в СБИС, того нет и тут.
// Что именно означают эти числа (на порцию или на 100 г) СБИС не сообщает.
export function pickNutrition(payload) {
  const attrs = payload?.attributes;
  if (!attrs) return null;
  const nutrition = {
    calories: toNumber(attrs.calories),
    protein: toNumber(attrs.protein),
    fat: toNumber(attrs.fat),
    carbs: toNumber(attrs.carbohydrate),
  };
  const filled = Object.values(nutrition).filter(v => v !== null).length;
  return filled >= 3 ? nutrition : null;
}

function toAppProduct(row) {
  // Ручное фото (image_override_url) — способ подставить нормальное фото
  // конкретному товару, не дожидаясь, пока оно появится в самом СБИС.
  // Синхронизация из СБИС эту колонку никогда не трогает (см.
  // add-image-override-column.sql) — правите только вы, вручную, в Table
  // Editor. Если её нет — используется то, что прислал СБИС (может не быть
  // вовсе, тогда ProductImage покажет фирменную заглушку).
  const uri = resolveImageUrl(row.image_override_url || row.image_url);
  // display_name — кураторское человеко-понятное название ("Капучино" вместо
  // "Кофе Капучино маленький"), проставляется вручную по таблице категоризации
  // (см. products-menu-taxonomy.sql). Если для позиции такого названия ещё
  // нет — берём исходное имя СБИС и всё равно отделяем от него объём/размер
  // автоматически, чтобы карточка не выглядела загромождённой.
  const { displayName, sizeLabel } = splitNameAndSize(row.display_name || row.name);
  // Таблица меню (data/menuData.js) важнее СБИС: КБЖУ, состав и объёмы берём
  // из неё, если позиция там есть. Иначе остаётся то, что прислал СБИС.
  const menuInfo = getMenuInfo({ displayName, name: row.name, sizeLabel });
  return {
    id: row.id,
    isAvailable: row.is_available !== false,
    sbisId: row.sbis_id,
    name: row.name,
    displayName,
    sizeLabel,
    description: row.description || menuInfo?.description || '',
    shortDescription: null,
    // Технический раздел СБИС — больше не используется для навигации в
    // приложении (см. menuCategory/menuSubcategory ниже), но остаётся для
    // отладки/фильтров вроде DESSERT_CATEGORY в программе лояльности... хотя
    // после перехода на menu_category её тоже стоит свести к menuCategory
    // отдельным шагом.
    category: row.category,
    subcategory: row.subcategory || row.category,
    // Кураторские, понятные покупателю раздел/под-раздел — заполняются
    // вручную (см. products-menu-taxonomy.sql), синхронизация из СБИС их не
    // трогает. Если для позиции ещё нет разметки — menuCategory будет null,
    // и fetchVisibleProducts её и не вернёт (is_visible=false по умолчанию
    // для неразмеченных позиций).
    menuCategory: row.menu_category || null,
    menuSubcategory: row.menu_subcategory || row.menu_category || null,
    price: Number(row.price),
    image: uri ? { uri } : null,
    badge: row.badge || null,
    isQuickPick: !!row.is_quick_pick,
    nutrition: menuInfo?.nutrition || pickNutrition(row.raw_payload),
    nutritionVariants: menuInfo?.nutritionVariants || null,
    nutritionCalculated: !!menuInfo?.calculated,
    menuVolumes: menuInfo?.volumes || null,
    weight: menuInfo?.weight || null,
  };
}

// Отдаёт только то, что явно подтверждено к показу (is_visible = true).
// Свежесинхронизированные из СБИС позиции по умолчанию скрыты, пока их не
// проверят вручную в Supabase — так синхронизация не может тихо показать
// клиентам что-то лишнее (см. supabase-products-schema.sql).
export async function fetchVisibleProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_visible', true)
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  const products = (data || []).map(toAppProduct);
  if (__DEV__) {
    // Позиции таблицы меню, для которых не нашлось товара в каталоге, —
    // чаще всего разное написание названия в СБИС.
    const unmatched = findUnmatchedMenuItems(products);
    if (unmatched.length) console.warn('[menu] нет в каталоге:', unmatched.join('; '));
    // Обратная проверка: товары каталога, которых нет в таблице меню, —
    // для них КБЖУ берётся только из СБИС (или не показывается).
    const withoutTable = products.filter(p => !getMenuInfo({ displayName: p.displayName, name: p.name, sizeLabel: p.sizeLabel }));
    if (withoutTable.length) {
      console.warn(`[menu] в каталоге без данных таблицы (${withoutTable.length} из ${products.length}):`, withoutTable.map(p => p.name).join('; '));
    }
  }
  return products;
}

// Порядок понятных покупателю разделов — их всего 4 и они не меняются от
// прихоти СБИС (в отличие от его собственных технических папок), поэтому
// здесь их можно зафиксировать явно. Если появится раздел с другим именем
// (например, вы захотите завести новый) — он просто добавится в конец, ничего
// не потеряется.
const MENU_CATEGORY_ORDER = ['Напитки', 'Еда', 'Десерты', 'Магазин'];

// Список разделов меню в порядке MENU_CATEGORY_ORDER, с учётом только того,
// что реально есть среди переданных товаров (пустые разделы не показываем).
export function buildCategoryList(products) {
  const present = new Set();
  (products || []).forEach(product => {
    if (product.menuCategory) present.add(product.menuCategory);
  });
  const ordered = MENU_CATEGORY_ORDER.filter(c => present.has(c));
  const extra = [...present].filter(c => !MENU_CATEGORY_ORDER.includes(c));
  return [...ordered, ...extra];
}

// Порядок под-разделов внутри каждого большого раздела — так же, как
// MENU_CATEGORY_ORDER выше, но на один уровень глубже. Значения совпадают с
// menu_subcategory, которые реально проставлены в products-menu-taxonomy.sql.
// Если появится под-раздел, которого здесь нет, он не потеряется — просто
// окажется в конце списка (см. buildSubcategoryList).
export const SUBCATEGORY_ORDER = {
  'Напитки': [
    'Кофе',
    'Авторский кофе',
    'Авторские без кофе',
    'Матча и убе',
    'Чай и травяные',
    'Какао и альтернативы',
    'Холодные напитки',
    'Напитки навынос',
    'Кофе в зёрнах',
  ],
  'Еда': [
    'Завтраки',
    'Сэндвичи и круассаны',
    'Супы и сытное',
    'Снеки',
  ],
  'Десерты': [
    'Пирожные и порционные',
    'Шу',
    'Выпечка',
    'Печенье и брауни',
    'Конфеты и сладости',
  ],
  'Магазин': [
    'Декор и подарки',
  ],
};

// Список под-разделов внутри одного большого раздела, в порядке
// SUBCATEGORY_ORDER, с учётом только реально присутствующих среди товаров.
export function buildSubcategoryList(products, mainCategory) {
  const present = new Set();
  (products || []).forEach(product => {
    if (product.menuCategory === mainCategory && product.menuSubcategory) {
      present.add(product.menuSubcategory);
    }
  });
  const order = SUBCATEGORY_ORDER[mainCategory] || [];
  const ordered = order.filter(s => present.has(s));
  const extra = [...present].filter(s => !order.includes(s));
  return [...ordered, ...extra];
}

function sizeRank(label) {
  const text = String(label || '').toLowerCase();
  if (/маленьк/.test(text)) return 1;
  if (/больш/.test(text)) return 2;
  const match = text.match(/\d+[.,]?\d*/);
  return match ? parseFloat(match[0].replace(',', '.')) : 0;
}

// Объём пишется только внутри карточки товара (там переключатель), поэтому в
// списках один напиток в нескольких объёмах показываем одной карточкой —
// самым маленьким вариантом. Остальные объёмы ProductScreen находит сам.
export function collapseSizeVariants(products) {
  const best = new Map();
  (products || []).forEach(product => {
    const key = `${product.menuCategory}|${product.menuSubcategory}|${product.displayName}`;
    const current = best.get(key);
    if (!current || sizeRank(product.sizeLabel) < sizeRank(current.sizeLabel)) best.set(key, product);
  });
  return (products || []).filter(product => best.get(`${product.menuCategory}|${product.menuSubcategory}|${product.displayName}`) === product);
}
