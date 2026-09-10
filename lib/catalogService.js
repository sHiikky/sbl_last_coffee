// lib/catalogService.js
// Загружает актуальное меню (товары и цены) из Supabase — таблица `products`
// синхронизируется из СБИС отдельной Edge Function, которую нужно один раз
// развернуть в проекте Supabase (см. "Claude outputs/supabase-products-schema.sql"
// и "Claude outputs/sync-sbis-catalog.ts"). Приложение НИКОГДА не обращается к
// СБИС напрямую и не хранит его ключи — это сознательное архитектурное решение
// (ключ СБИС не должен жить в мобильном клиенте).
import { supabase } from './supabaseClient';

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
  return {
    id: row.id,
    sbisId: row.sbis_id,
    name: row.name,
    displayName,
    sizeLabel,
    description: row.description || '',
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
    // Реальные позиции СБИС пока не несут КБЖУ — раньше это было в
    // захардкоженном каталоге вручную. Если нужно будет вернуть — можно
    // добавить свою колонку в таблицу products и заполнять её вручную.
    kbzhu: null,
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
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map(toAppProduct);
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
