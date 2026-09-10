// loyalty/loyaltyDev.js
// DEV-only помощники для ручного тестирования streak без ожидания реальных
// 10 дней. Чистые фабрики синтетических заказов — сама мутация состояния
// (добавление в orderHistory / очистка AsyncStorage) остаётся в App.js,
// вызывается там только под `if (__DEV__)`. Этот файл ни при каких условиях
// не должен импортироваться из production-веток UI.
import { LOYALTY_TIMEZONE } from './loyaltyConfig.js';
import { getTodayBusinessDayKey } from './loyaltyDate.js';

function shiftDayKey(dayKey, delta) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

let devOrderCounter = 0;

export function buildSyntheticLoyaltyOrder(dateKey) {
  devOrderCounter += 1;
  return {
    id: `dev_${dateKey}_${devOrderCounter}`,
    orderNumber: 'SBL-DEV',
    createdAt: `${dateKey}T12:00:00.000Z`,
    pickupTime: 'Через 15 мин',
    pickupPoint: 'DEV',
    total: 0,
    itemCount: 1,
    earnedBonuses: 0,
    items: [],
    devSynthetic: true,
  };
}

/** Один синтетический заказ на "сегодня" (business day кофейни). */
export function buildTodaySyntheticOrder() {
  return buildSyntheticLoyaltyOrder(getTodayBusinessDayKey(LOYALTY_TIMEZONE));
}

/** `days` синтетических заказов подряд, заканчивая сегодняшним business day. */
export function buildSyntheticStreakOrders(days, endingDayKey) {
  const end = endingDayKey || getTodayBusinessDayKey(LOYALTY_TIMEZONE);
  const orders = [];
  let cursor = end;
  for (let i = 0; i < days; i++) {
    orders.push(buildSyntheticLoyaltyOrder(cursor));
    cursor = shiftDayKey(cursor, -1);
  }
  return orders;
}
