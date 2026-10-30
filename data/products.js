// data/products.js
// Раньше здесь был захардкоженный каталог напитков. Теперь реальное меню
// (товары, цены, картинки) приходит из Supabase — см. lib/catalogService.js.
// Этот файл оставляет только то, что не зависит от источника каталога:
// форматирование цены, ключ строки корзины и точки/время самовывоза.

// Категория десертов нужна отдельно программе лояльности
// (loyalty/loyaltyService.js, награда "free_dessert") — вынесена сюда как
// единая точка правды. Это кураторский раздел меню (menu_category в Supabase,
// см. products-menu-taxonomy.sql), а НЕ сырой раздел СБИС "Сытное/Десерты" —
// тот включает в себя ещё и сэндвичи/супы/завтраки, которые дарить бесплатно
// в рамках этой награды не должны.
export const DESSERT_CATEGORY = 'Десерты';

export const PICKUP_TIMES = [
  'Через 3–5 минут',
];

export const PICKUP_POINTS = [
  'SBL · Томск, проспект Ленина, 72',
];

export function formatPrice(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} ₽`;
}

// Размер — отдельный SKU; добавки и пожелание отличают рецепты одного SKU.
export { optionCartKey as cartKey } from '../lib/cartOptions.js';

export function getProductById(products, id) {
  return (products || []).find(product => product.id === id);
}
