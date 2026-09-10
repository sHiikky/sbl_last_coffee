// loyalty/loyaltySelectors.js
// Всё, что UI-компонентам нужно вычислить из loyalty state, живёт здесь —
// а не внутри JSX. Компоненты только рендерят то, что вернули селекторы.
import { LOYALTY_CONFIG } from './loyaltyConfig.js';
import { getCycleProgress, getAvailableRewards } from './loyaltyService.js';
import { addBusinessDays, formatDayNumber } from './loyaltyDate.js';

/**
 * Строит массив нод текущего 10-дневного этапа для карты/мини-пути.
 * Каждая нода — { index, dateKey, dayNumber, status, isToday }, плюс
 * последний элемент — reward-нода { index, kind: 'reward', status }.
 * status ноды дня: 'completed' | 'today_pending' | 'future'.
 */
export function getCurrentLoyaltyPath(loyaltyState, config = LOYALTY_CONFIG) {
  const cycleLength = config.cycleLength;
  const { currentStreak, todayStatus, currentStreakStartDay, today } = loyaltyState;
  const cycleProgress = getCycleProgress(currentStreak, cycleLength);

  // Якорим этап на дне начала текущей серии (реальная дата), а не считаем
  // "назад от сегодня" — так этап остаётся стабильным даже в broken-статусе.
  // У нового пользователя (нет серии) якорим на сегодня, чтобы всё равно
  // показать реальные календарные даты предстоящих 10 дней.
  const cycleStartDay = currentStreakStartDay
    ? addBusinessDays(currentStreakStartDay, (cycleProgress.cycle - 1) * cycleLength)
    : today;

  const nodes = [];
  for (let i = 1; i <= cycleLength; i++) {
    const dateKey = addBusinessDays(cycleStartDay, i - 1);
    const isToday = dateKey === today;

    // 'today_pending' подсвечивается только когда есть живая серия, которую
    // нужно продолжить сегодня. У нового пользователя (todayStatus='new') все
    // ноды остаются нейтральными (см. ТЗ п.30 "Все path nodes inactive") —
    // раньше здесь ошибочно подсвечивался день 1 как активный. В 'broken'
    // тоже не подсвечиваем: это уже не тот цикл, что был прерван, а показ
    // "сегодня" внутри старого 10-дневного окна вводил в заблуждение.
    let status = 'future';
    if (i <= cycleProgress.progress) {
      status = 'completed';
    } else if (isToday && todayStatus === 'pending') {
      status = 'today_pending';
    }

    nodes.push({
      index: i,
      dateKey,
      dayNumber: formatDayNumber(dateKey),
      status,
      isToday,
    });
  }

  nodes.push({
    index: cycleLength + 1,
    kind: 'reward',
    status: cycleProgress.progress >= cycleLength ? 'reward_available' : 'reward_locked',
  });

  return nodes;
}

export function getDaysUntilNextMilestone(loyaltyState, config = LOYALTY_CONFIG) {
  const cycleLength = config.cycleLength;
  const progress = loyaltyState.cycleProgress?.progress ?? 0;
  if (progress >= cycleLength) return 0;
  return cycleLength - progress;
}

export function selectAvailableRewards(rewards) {
  return getAvailableRewards(rewards);
}

/** Компактная сводка для HomeWidget / LoyaltyScreen шапки. */
export function getLoyaltySummary(loyaltyState, rewards, config = LOYALTY_CONFIG) {
  const { currentStreak, todayStatus, longestStreak } = loyaltyState;
  const daysUntilReward = getDaysUntilNextMilestone(loyaltyState, config);
  const available = selectAvailableRewards(rewards);

  return {
    currentStreak,
    longestStreak,
    todayStatus,
    daysUntilReward,
    hasAvailableReward: available.length > 0,
    availableRewardsCount: available.length,
  };
}
