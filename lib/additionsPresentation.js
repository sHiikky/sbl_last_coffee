// Что и как показывать в «Сделать по-своему». Только презентация: SKU, цены и id
// добавок остаются серверными. Список в СБИС приходит с дублями (молоко 200/300 мл,
// «альтер.» отдельной строкой) и с позициями для еды, поэтому его чистим здесь.
// Каталог режет объём из названия (displayName «молоко кокосовое», sizeLabel «300 мл»),
// поэтому правила применяются к полному `name`, а показывается чистое название.
const FOOD_ONLY = /икр|масл|сыр|хлеб|яйц|конфитюр/;
const NEVER = /^чай(\s|$)/;
const ALT_MILK = /^молоко (кокосовое|миндальное|безлактозное)\s*(\d+)\s*мл/;
const ALT_TITLES = { кокосовое: 'Кокосовое молоко', миндальное: 'Миндальное молоко', безлактозное: 'Безлактозное молоко' };
const ALT_ORDER = ['кокосовое', 'миндальное', 'безлактозное'];
// Какие добавки уместны к какому типу напитка (практика бариста; в схему попали только
// «да», спорное — «редко» — не предлагается). Тип определяется подразделом меню и названием.
const KIND_RULES = [
  ['sour', /тоник|бамбл|цитрус|грейпфрут|шмель/],
  ['lemonade', /лимонад|морс|апероль|компот|фреш/],
  ['smoothie', /смузи|протеин|коктейль|шейк/],
  ['matcha', /матча|убе|таро|ходжича/],
  ['cocoa', /какао|шоколад|кэроб/],
  ['tea', /чай|чайник|травян|глинтвейн/],
  ['black', /эспрессо|американо|доппио|ристретто|френч|фильтр|воронка/],
  ['coldMilk', /айс|холодн/],
  ['milkCoffee', /раф|латте|капучино|флэт|кортадо|мокко|макиато|глясе/],
];
const ALLOWED = {
  black: ['syrup', 'cardamom'],
  milkCoffee: ['alt', 'milk', 'syrup', 'honey', 'cardamom'],
  coldMilk: ['alt', 'milk', 'syrup', 'honey', 'cardamom', 'icecream'],
  sour: ['syrup', 'ginger', 'soda'],
  lemonade: ['syrup', 'honey', 'ginger', 'soda', 'cardamom'],
  matcha: ['alt', 'milk', 'syrup'],
  tea: ['honey', 'ginger', 'cardamom'],
  cocoa: ['alt', 'milk', 'cream', 'syrup', 'icecream', 'marshmallow', 'peanut', 'urbech', 'cocoa'],
  smoothie: ['alt', 'milk', 'honey', 'peanut', 'urbech', 'ginger', 'cocoa'],
};
const TOKENS = [
  ['milk', /^молоко 100/], ['cream', /^сливки/], ['syrup', /^сироп/], ['icecream', /^мороженое/],
  ['honey', /^м[её]д/], ['marshmallow', /^марш/], ['peanut', /^паста арахис/], ['urbech', /^урбеч/],
  ['ginger', /имбир/], ['soda', /^содовая/], ['cardamom', /кардамон/], ['cocoa', /какао порошок/], ['matchaPowder', /матча порошок/],
];

function drinkKind(product) {
  const name = String(product?.displayName || product?.name || '').toLocaleLowerCase('ru-RU');
  const byName = KIND_RULES.find(([, pattern]) => pattern.test(name))?.[0];
  switch (product?.menuSubcategory) {
    case 'Кофе в зёрнах': return null;
    case 'Кофе': return byName === 'black' ? 'black' : 'milkCoffee';
    case 'Авторский кофе': return byName === 'sour' ? 'sour' : 'milkCoffee';
    case 'Авторские без кофе': return ['matcha', 'cocoa', 'tea', 'smoothie', 'sour'].includes(byName) ? byName : 'lemonade';
    case 'Матча и убе': return 'matcha';
    case 'Чай и травяные': return 'tea';
    case 'Какао и альтернативы': return 'cocoa';
    case 'Холодные напитки': return ['smoothie', 'sour', 'coldMilk', 'milkCoffee'].includes(byName) ? (byName === 'milkCoffee' ? 'coldMilk' : byName) : 'lemonade';
    default: return byName || 'milkCoffee';
  }
}

const SHOWN_CATEGORIES = ['Напитки', 'Еда', 'Десерты'];

export function cleanAdditionName(value) {
  const name = String(value || '').replace(/^[\s+\-–—]+/, '').replace(/(\d)\s*(мл|гр|г)(?![а-яa-z])\.?/gi, '$1 $2').replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  return name.charAt(0).toLocaleUpperCase('ru-RU') + name.slice(1);
}

function fullKey(modifier) {
  return cleanAdditionName(modifier?.name || modifier?.displayName).toLocaleLowerCase('ru-RU');
}

function volumeMl(product) {
  const match = String(product?.sizeLabel || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(л|мл)?/i);
  if (!match) return 300;
  const value = Number(match[1]);
  return /^л$/i.test(match[2] || '') ? value * 1000 : value;
}

export function isAltMilk(modifier) {
  return ALT_MILK.test(fullKey(modifier));
}

// Красивое название добавки для корзины и повтора заказа.
export function additionTitle(modifier) {
  const alt = fullKey(modifier).match(ALT_MILK);
  return alt ? ALT_TITLES[alt[1]] : cleanAdditionName(modifier?.displayName || modifier?.name);
}

export function presentAdditions(product, modifiers = []) {
  const category = product?.menuCategory || null;
  // Для позиций без разметки и для «Магазина» добавок нет.
  if (!SHOWN_CATEGORIES.includes(category)) return [];
  const drink = category === 'Напитки';
  const food = category === 'Еда';
  const want = volumeMl(product) >= 300 ? 300 : 200;
  const kind = drink ? drinkKind(product) : null;
  if (drink && !kind) return [];
  const allowed = drink ? new Set(ALLOWED[kind]) : null;
  const alt = new Map();
  const rest = [];
  for (const modifier of modifiers) {
    if (modifier?.isAvailable === false) continue;
    const key = fullKey(modifier);
    const altMatch = key.match(ALT_MILK);
    if (altMatch) {
      const volume = Number(altMatch[2]);
      const current = alt.get(altMatch[1]);
      if (!current || Math.abs(volume - want) < Math.abs(current.volume - want)) alt.set(altMatch[1], { modifier, volume });
      continue;
    }
    if (/^молоко (альтер|50\s*мл)/.test(key) || NEVER.test(key)) continue;
    const foodOnly = FOOD_ONLY.test(key);
    if (drink && (foodOnly || !allowed.has(TOKENS.find(([, pattern]) => pattern.test(key))?.[0]))) continue;
    if (food && !foodOnly) continue;
    if (category === 'Десерты' && !/^мороженое/.test(key)) continue;
    rest.push({ ...modifier, displayName: /^сироп/.test(key) ? 'Сироп' : cleanAdditionName(modifier.displayName || modifier.name) });
  }
  const altItems = drink && allowed.has('alt') ? ALT_ORDER.filter(kind => alt.has(kind)).map(kind => ({ ...alt.get(kind).modifier, displayName: ALT_TITLES[kind], altMilk: true })) : [];
  return [...altItems, ...rest];
}
