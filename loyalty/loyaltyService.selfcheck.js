// loyalty/loyaltyService.selfcheck.js
// В проекте нет test runner'а (jest и т.п. не установлены — не стали ставить
// ради этой задачи, см. ТЗ п.43 "если нет — хотя бы чистые функции + локальная
// проверка"). Этот файл — обычный executable-скрипт для ручной/CI-проверки
// чистых функций домена: `node loyaltyService.selfcheck.js` (см. loyalty/package.json
// с "type":"module" — только для того, чтобы Node мог выполнить этот файл
// напрямую; Metro/Expo эту настройку не читает и не использует).
//
// Покрывает все 12 обязательных сценариев из ТЗ п.43.

import {
  deriveLoyaltyStateFromOrders,
  deriveVisitedDaysFromOrders,
  computeLoyaltyStateFromVisitedDays,
  reconcileLoyaltyMilestones,
} from './loyaltyService.js';
import { getCurrentLoyaltyPath } from './loyaltySelectors.js';

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

function order(dateKey, hour = '10:00:00') {
  return { createdAt: `${dateKey}T${hour}.000Z`, total: 300 };
}

const CONFIG = {
  enabled: true,
  qualification: { maxMarksPerDay: 1, minimumOrderAmount: 0, requiredOrderStatus: 'completed' },
  streak: { timezone: 'UTC', graceDays: 0 },
  cycleLength: 10,
  milestones: [{ streakDays: 10, rewardType: 'free_dessert', rewardValue: 1, title: 'Десерт в подарок', description: 'За 10 дней подряд' }],
  reward: { expiresInDays: 30 },
  rewardEligibilityStrategy: 'cheapest_dessert',
};

// 1. Aug 1,2,3,4 -> streak 4
{
  const orders = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-04');
  assertEqual(state.currentStreak, 4, '1. 4 дня подряд -> streak 4');
}

// 2. Aug 1,2,3,4 + ещё 3 заказа Aug 4 -> streak 4, а не 7
{
  const orders = [
    order('2026-08-01'), order('2026-08-02'), order('2026-08-03'),
    order('2026-08-04', '09:00:00'), order('2026-08-04', '14:00:00'), order('2026-08-04', '19:00:00'),
  ];
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-04');
  assertEqual(state.currentStreak, 4, '2. Несколько заказов в один день -> streak 4, не 7');
}

// 3. Aug 1,2,3,4, нет Aug 5, order Aug 6 -> streak 1
{
  const orders = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-06'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-06');
  assertEqual(state.currentStreak, 1, '3. Пропуск дня прерывает серию -> новая серия = 1');
}

// 4. Aug 28,29,30,31, Sep 1 -> streak 5 (переход месяца)
{
  const orders = ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-09-01');
  assertEqual(state.currentStreak, 5, '4. Переход через конец месяца -> streak 5');
}

// 5. Dec 30, 31, Jan 1 -> streak 3 (переход года)
{
  const orders = ['2025-12-30', '2025-12-31', '2026-01-01'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-01-01');
  assertEqual(state.currentStreak, 3, '5. Переход через новый год -> streak 3');
}

// 6 + 7. 10 последовательных дней -> reward создан один раз, повторный пересчёт не плодит второй
{
  const days = [];
  for (let i = 1; i <= 10; i++) days.push(`2026-08-${String(i).padStart(2, '0')}`);
  const orders = days.map(d => order(d));
  const visitedDays = deriveVisitedDaysFromOrders(orders, CONFIG);
  const state = computeLoyaltyStateFromVisitedDays(visitedDays, CONFIG, '2026-08-10');

  const firstPass = reconcileLoyaltyMilestones(state, { milestonesClaimed: [], rewards: [] }, CONFIG);
  assertEqual(firstPass.rewards.length, 1, '6. 10 дней подряд -> ровно одна награда создана');

  const secondPass = reconcileLoyaltyMilestones(state, firstPass, CONFIG);
  assertEqual(secondPass.newlyEarnedRewards.length, 0, '7. Повторный пересчёт той же истории -> второй награды нет');
  assertEqual(secondPass.rewards.length, 1, '7b. Общее число наград не выросло после пересчёта');
}

// 8. 11 последовательных дней -> currentStreak 11
{
  const days = [];
  for (let i = 1; i <= 11; i++) days.push(`2026-08-${String(i).padStart(2, '0')}`);
  const orders = days.map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-11');
  assertEqual(state.currentStreak, 11, '8. 11 дней подряд -> currentStreak 11 (серия продолжается после награды)');
}

// 9. streak 4 вчера, сегодня заказа ещё нет -> currentStreak всё ещё 4, todayStatus pending
{
  const orders = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-05');
  assertEqual(state.currentStreak, 4, '9a. currentStreak не обнуляется утром следующего дня');
  assertEqual(state.todayStatus, 'pending', '9b. todayStatus = pending, пока не куплено сегодня');
}

// 10. Последний визит два дня назад -> broken
{
  const orders = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-06');
  assertEqual(state.todayStatus, 'broken', '10. Пропущен целый день -> серия broken');
}

// 11. Refund единственного заказа дня -> день исчезает, streak пересчитан
{
  const withRefund = [
    order('2026-08-01'), order('2026-08-02'), order('2026-08-03'),
    { createdAt: '2026-08-04T10:00:00.000Z', total: 300, status: 'refunded' },
  ];
  const state = deriveLoyaltyStateFromOrders(withRefund, CONFIG, '2026-08-04');
  assertEqual(state.currentStreak, 3, '11. Refund единственного заказа дня -> день не засчитан, streak 3');
  assertEqual(state.todayStatus, 'pending', '11b. todayStatus для 04.08 = pending (день не закрыт)');
}

// 12. Два заказа в один день, один refunded -> день остаётся completed
{
  const mixed = [
    order('2026-08-01'), order('2026-08-02'), order('2026-08-03'),
    order('2026-08-04', '09:00:00'),
    { createdAt: '2026-08-04T14:00:00.000Z', total: 300, status: 'refunded' },
  ];
  const state = deriveLoyaltyStateFromOrders(mixed, CONFIG, '2026-08-04');
  assertEqual(state.currentStreak, 4, '12. Один из двух заказов дня refunded -> день всё равно засчитан');
}

// 13. Новый пользователь (нет ни одной покупки) -> все ноды карты неактивны
// (регрессия для бага: раньше день 1 ошибочно подсвечивался как "today_pending").
{
  const state = computeLoyaltyStateFromVisitedDays([], CONFIG, '2026-08-10');
  const nodes = getCurrentLoyaltyPath(state, CONFIG);
  const dayNodes = nodes.filter(n => n.kind !== 'reward');
  const allFuture = dayNodes.every(n => n.status === 'future');
  assertEqual(allFuture, true, '13. Новый пользователь -> все 10 нод карты неактивны (future)');
}

// 14. Broken-статус -> сегодняшняя дата в старом окне карты не подсвечивается как pending
{
  const orders = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-06');
  const nodes = getCurrentLoyaltyPath(state, CONFIG);
  const pendingNodes = nodes.filter(n => n.status === 'today_pending');
  assertEqual(pendingNodes.length, 0, '14. Broken -> нет today_pending нод в карте старого цикла');
}

// 15. Pending-статус -> ровно сегодняшняя нода подсвечена как today_pending
{
  const orders = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(d => order(d));
  const state = deriveLoyaltyStateFromOrders(orders, CONFIG, '2026-08-05');
  const nodes = getCurrentLoyaltyPath(state, CONFIG);
  const pendingNodes = nodes.filter(n => n.status === 'today_pending');
  assertEqual(pendingNodes.length, 1, '15a. Pending -> ровно одна today_pending нода');
  assertEqual(pendingNodes[0]?.dateKey, '2026-08-05', '15b. today_pending нода соответствует сегодняшней дате');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
