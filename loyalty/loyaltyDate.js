// loyalty/loyaltyDate.js
// Утилиты для работы с "business day" — календарным днём кофейни в её часовом
// поясе. Никогда не сравнивать дни через new Date().toDateString() или деление
// разницы миллисекунд на 86400000 напрямую на "сырых" timestamp'ах — это ломается
// на переходе через полночь в других таймзонах и на DST.
//
// Подход: timestamp -> businessDayKey ('YYYY-MM-DD' в таймзоне кофейни) через
// Intl.DateTimeFormat (единственная точка, где участвует часовой пояс). Дальше
// весь арифметика (сравнение, +1 день, разница в днях) работает над самим
// нормализованным ключом через Date.UTC — это уже безопасно от DST, потому что
// UTC не имеет переходов на летнее/зимнее время.

import { LOYALTY_TIMEZONE } from './loyaltyConfig.js';

/**
 * timestamp (Date | string | number) -> 'YYYY-MM-DD' в заданном часовом поясе.
 */
// Кэш форматтеров по таймзоне — Intl.DateTimeFormat недёшево создавать на
// каждый вызов, а вызывается это на каждый заказ при пересчёте истории.
const formatterCache = new Map();

function getFormatter(timezone) {
  if (formatterCache.has(timezone)) return formatterCache.get(timezone);

  let formatter;
  try {
    // en-CA форматирует как YYYY-MM-DD "из коробки".
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (error) {
    // Движок может не знать конкретную IANA-зону (например, урезанный ICU на
    // старом Hermes) — не роняем всё приложение, откатываемся на UTC, чтобы
    // businessDayKey хотя бы оставался детерминированным и не крашил рендер.
    console.warn(`[loyalty] Timezone "${timezone}" unsupported, falling back to UTC`, error);
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  formatterCache.set(timezone, formatter);
  return formatter;
}

export function getBusinessDayKey(timestamp, timezone = LOYALTY_TIMEZONE) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return getFormatter(timezone).format(date);
}

export function getTodayBusinessDayKey(timezone = LOYALTY_TIMEZONE) {
  return getBusinessDayKey(new Date(), timezone);
}

function dayKeyToUTCDate(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToDayKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Сдвигает businessDayKey на delta календарных дней (может быть отрицательным). */
export function addBusinessDays(dayKey, delta) {
  const date = dayKeyToUTCDate(dayKey);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDateToDayKey(date);
}

export function getPreviousBusinessDay(dayKey) {
  return addBusinessDays(dayKey, -1);
}

export function getNextBusinessDay(dayKey) {
  return addBusinessDays(dayKey, 1);
}

export function isSameBusinessDay(a, b) {
  return !!a && !!b && a === b;
}

export function isNextBusinessDay(prevKey, nextKey) {
  return getNextBusinessDay(prevKey) === nextKey;
}

/** Возвращает (toKey - fromKey) в календарных днях. Корректно на границах месяца/года/високосного года. */
export function differenceInBusinessCalendarDays(fromKey, toKey) {
  const from = dayKeyToUTCDate(fromKey).getTime();
  const to = dayKeyToUTCDate(toKey).getTime();
  return Math.round((to - from) / 86400000);
}

/** Номер дня месяца для отображения на ноде карты, например '08', '09', '31', '01'. */
export function formatDayNumber(dayKey) {
  return dayKey.split('-')[2];
}
