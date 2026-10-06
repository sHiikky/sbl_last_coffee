// lib/menuLookup.js
// Сопоставляет товар из каталога (Supabase/СБИС) с позицией из таблицы меню
// (data/menuData.js) по названию и отдаёт КБЖУ, состав и доступные объёмы.
// Данные из таблицы важнее СБИС: в СБИС КБЖУ заполнено лишь у части позиций.
import { MENU_ITEMS } from '../data/menuData';

export function normalizeName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'!.,]/g, ' ')
    .replace(/[-–—/]/g, ' ')
    .replace(/\d+\s?(?:мл|л|г|гр|кг)\b/g, ' ')
    .replace(/\s+(маленький|маленькая|большой|большая|средний|средняя)\s*$/, '')
    .replace(/^кофе\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function keysFor(title) {
  const keys = new Set([normalizeName(title)]);
  const noParens = title.replace(/\([^)]*\)/g, ' ');
  keys.add(normalizeName(noParens));
  const inParens = title.match(/\(([^)]*)\)/);
  if (inParens && !/\//.test(inParens[1])) keys.add(normalizeName(inParens[1]));
  return [...keys].filter(Boolean);
}

const INDEX = new Map();
MENU_ITEMS.forEach(item => {
  keysFor(item.title).forEach(key => {
    if (!INDEX.has(key)) INDEX.set(key, item);
  });
});

export function findMenuItem(...names) {
  for (const name of names) {
    const item = INDEX.get(normalizeName(name));
    if (item) return item;
  }
  return null;
}

function parseMl(label) {
  const match = String(label || '').match(/(\d+[.,]?\d*)\s*(?:мл|л)?/i);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
}

// Какой именно объём таблицы соответствует этому товару каталога.
function pickVolume(item, sizeLabel) {
  const volumes = item.volumes || [];
  if (volumes.length <= 1) return volumes[0] || null;
  const label = String(sizeLabel || '').toLowerCase();
  if (/маленьк/.test(label)) return volumes[0];
  if (/больш/.test(label)) return volumes[volumes.length - 1];
  const ml = parseMl(sizeLabel);
  if (ml) {
    return volumes.reduce((best, v) => (Math.abs((v.ml || 0) - ml) < Math.abs((best.ml || 0) - ml) ? v : best), volumes[0]);
  }
  // Размер в названии не указан — это полный объём (по нему в таблице и дан КБЖУ).
  return volumes[volumes.length - 1];
}

// Данные для карточки товара. null — в таблице такой позиции нет, тогда
// остаются данные СБИС, ничего не выдумываем.
export function getMenuInfo({ displayName, name, sizeLabel }) {
  const item = findMenuItem(displayName, name);
  if (!item) return null;
  if (item.kind === 'food') {
    return { nutrition: item.nutrition, nutritionVariants: null, calculated: false, description: item.description, volumes: null, weight: item.weight || null };
  }
  const volume = pickVolume(item, sizeLabel);
  const isFull = volume === item.volumes[item.volumes.length - 1];
  const variants = item.nutritionVariants
    ? item.nutritionVariants.map(v => ({
        label: v.label,
        // у вариантов КБЖУ дан на полный объём; для меньшего объёма пересчитываем
        nutrition: isFull || !volume ? v.nutrition : scaleNutrition(v.nutrition, (volume.ml || 1) / (item.volumes[item.volumes.length - 1].ml || 1)),
      }))
    : null;
  return {
    nutrition: variants ? variants[0].nutrition : volume?.nutrition || null,
    nutritionVariants: variants && variants.length > 1 ? variants : null,
    calculated: !!volume?.calculated || (!isFull && !!variants),
    description: item.description,
    volumes: item.volumes.length > 1 ? item.volumes.map(v => v.ml).filter(Boolean) : null,
    weight: null,
  };
}

function round1(x) {
  const r = Math.round(x * 10) / 10;
  return r;
}

function scaleNutrition(n, factor) {
  return { calories: round1(n.calories * factor), protein: round1(n.protein * factor), fat: round1(n.fat * factor), carbs: round1(n.carbs * factor) };
}

// Список названий из таблицы, которым не нашлось товара в каталоге (для
// проверки после загрузки каталога — см. catalogService.fetchVisibleProducts).
export function findUnmatchedMenuItems(products) {
  const used = new Set();
  (products || []).forEach(p => {
    const item = findMenuItem(p.displayName, p.name);
    if (item) used.add(item.title);
  });
  return MENU_ITEMS.filter(item => !used.has(item.title)).map(item => item.title);
}
