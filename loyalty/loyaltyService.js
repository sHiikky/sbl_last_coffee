// loyalty/loyaltyService.js
// Чистые функции домена "Серия SBL". Ничего здесь не знает про React,
// AsyncStorage или UI — это позволяет тестировать и позже безболезненно
// заменить локальный источник данных на backend (см. README в конце файла).
//
// Поток данных (см. также loyalty/useLoyaltyState.js):
//   заказ оформлен -> deriveVisitedDaysFromOrders -> (merge с накопленной
//   историей) -> computeLoyaltyStateFromVisitedDays -> reconcileLoyaltyMilestones
//   -> persist -> UI selectors.
// UI никогда не делает currentStreak++ напрямую.

import { LOYALTY_CONFIG } from './loyaltyConfig.js';
import {
  getBusinessDayKey,
  getTodayBusinessDayKey,
  isNextBusinessDay,
  differenceInBusinessCalendarDays,
} from './loyaltyDate.js';
// Название категории десертов — не хардкодим "dessert" здесь: реальная
// категория приходит из СБИС (сейчас "Сытное/Десерты") и хранится в одном
// месте, см. data/products.js.
import { DESSERT_CATEGORY } from '../data/products.js';

// ---------------------------------------------------------------------------
// 1. Какие заказы вообще считаются посещением
// ---------------------------------------------------------------------------

/**
 * Единственное место, где решается, "засчитывается" ли заказ в программу
 * лояльности. Сейчас в приложении нет статусов оплаты/отмены — любой заказ,
 * попавший в orderHistory, по построению App.js.placeOrder уже успешно
 * оформлен. Поля ниже (status/cancelled/refunded) не существуют в текущей
 * модели данных, но проверяются на будущее: как только в проекте появится
 * реальный статус заказа (или backend), достаточно поменять эту функцию.
 */
export function isOrderQualifyingForLoyalty(order, config = LOYALTY_CONFIG) {
  if (!order || !order.createdAt) return false;
  if (order.cancelled === true || order.refunded === true) return false;
  if (order.status && ['cancelled', 'refunded', 'failed', 'draft'].includes(order.status)) return false;

  const minAmount = config.qualification.minimumOrderAmount || 0;
  if (minAmount > 0 && (order.total || 0) < minAmount) return false;

  return true;
}

/** orders[] -> отсортированный список уникальных businessDayKey, отмеченных хотя бы одной qualifying-покупкой. */
export function deriveVisitedDaysFromOrders(orders = [], config = LOYALTY_CONFIG) {
  const timezone = config.streak.timezone;
  const set = new Set();

  orders.forEach(order => {
    if (!isOrderQualifyingForLoyalty(order, config)) return;
    const dayKey = getBusinessDayKey(order.createdAt, timezone);
    if (dayKey) set.add(dayKey);
  });

  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// 2. Расчёт streak
// ---------------------------------------------------------------------------

/**
 * Считает текущую и максимальную серию по списку посещённых дней.
 *
 * currentStreak — длина последней непрерывной серии, заканчивающейся самым
 * поздним посещённым днём (lastQualifiedDay). Он НЕ обнуляется сам по себе
 * на следующее утро — "жив" ли он для пользователя, решает todayStatus
 * (см. getTodayStatus), а не это число.
 */
export function calculateStreak(visitedDays = [], todayKey) {
  const uniqueSorted = Array.from(new Set(visitedDays)).sort();

  if (uniqueSorted.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastQualifiedDay: null, currentStreakStartDay: null };
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueSorted.length; i++) {
    run = isNextBusinessDay(uniqueSorted[i - 1], uniqueSorted[i]) ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
  }

  // Длина серии, заканчивающейся последним посещённым днём, и день, с которого
  // эта серия началась (нужен как стабильный ключ идемпотентности наград).
  let currentStreak = 1;
  let startIndex = uniqueSorted.length - 1;
  for (let i = uniqueSorted.length - 1; i > 0; i--) {
    if (isNextBusinessDay(uniqueSorted[i - 1], uniqueSorted[i])) {
      currentStreak += 1;
      startIndex = i - 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    lastQualifiedDay: uniqueSorted[uniqueSorted.length - 1],
    currentStreakStartDay: uniqueSorted[startIndex],
  };
}

/**
 * 'new'       — ни одной покупки никогда не было.
 * 'completed' — сегодняшний businessDay уже засчитан.
 * 'pending'   — последняя покупка была вчера, серия жива, но сегодня ещё не куплено.
 * 'broken'    — последняя покупка была два и более дня назад, серия прервана.
 */
export function getTodayStatus({ lastQualifiedDay, today }) {
  if (!lastQualifiedDay) return 'new';
  const diff = differenceInBusinessCalendarDays(lastQualifiedDay, today);
  if (diff <= 0) return 'completed';
  if (diff === 1) return 'pending';
  return 'broken';
}

/**
 * Режет currentStreak на 10-дневные (cycleLength) этапы для UI-карты.
 * Явная функция вместо currentStreak % cycleLength, чтобы кратные cycleLength
 * значения (10, 20, 30...) оставались "последним днём текущего этапа",
 * а не "первым днём следующего" — см. ТЗ п.12.
 */
export function getCycleProgress(currentStreak, cycleLength = LOYALTY_CONFIG.cycleLength) {
  if (!currentStreak || currentStreak <= 0) {
    return { cycle: 1, progress: 0, cycleLength };
  }
  const cycle = Math.ceil(currentStreak / cycleLength);
  const progress = currentStreak - (cycle - 1) * cycleLength;
  return { cycle, progress, cycleLength };
}

/** days[] -> полное вычисленное состояние (без учёта persisted rewards/milestones). */
export function computeLoyaltyStateFromVisitedDays(visitedDays = [], config = LOYALTY_CONFIG, todayKey) {
  const today = todayKey || getTodayBusinessDayKey(config.streak.timezone);
  const { currentStreak, longestStreak, lastQualifiedDay, currentStreakStartDay } = calculateStreak(visitedDays, today);
  const todayStatus = getTodayStatus({ lastQualifiedDay, today });
  const cycleProgress = getCycleProgress(currentStreak, config.cycleLength);

  return {
    visitedDays: Array.from(new Set(visitedDays)).sort(),
    currentStreak,
    longestStreak,
    lastQualifiedDay,
    currentStreakStartDay,
    today,
    todayStatus,
    cycleProgress,
  };
}

/**
 * Точка входа уровня domain, требуемая ТЗ: orders[] -> полное состояние.
 * Внимание: в App.js orderHistory хранит только последние 12 заказов (см.
 * placeOrder), поэтому в UI-слое (loyalty/useLoyaltyState.js) эта функция не
 * используется напрямую на "сыром" orderHistory — там значения из неё
 * накопительно сливаются с ранее сохранённым visitedDays, чтобы обрезка
 * истории не съедала прогресс. Для тестов и для восстановления "с нуля"
 * (например, после переустановки) эта функция самодостаточна.
 */
export function deriveLoyaltyStateFromOrders(orders = [], config = LOYALTY_CONFIG, todayKey) {
  const visitedDays = deriveVisitedDaysFromOrders(orders, config);
  return computeLoyaltyStateFromVisitedDays(visitedDays, config, todayKey);
}

// ---------------------------------------------------------------------------
// 3. Milestones и награды
// ---------------------------------------------------------------------------

export function getReachedMilestones(currentStreak, config = LOYALTY_CONFIG) {
  return config.milestones.filter(m => currentStreak >= m.streakDays);
}

/**
 * Идемпотентный ключ достижения milestone. Привязан не к дате, а к дню начала
 * ТЕКУЩЕЙ серии (currentStreakStartDay) — так пересчёт истории (например,
 * после reconciliation) всегда даёт тот же ключ для той же серии, но если
 * пользователь пройдёт 10 дней заново после разрыва серии, это уже другая
 * серия (другой startDay) и она законно может принести награду снова.
 */
export function buildMilestoneAchievementId(streakDays, currentStreakStartDay) {
  return `streak:${streakDays}:start:${currentStreakStartDay}`;
}

export function hasMilestoneRewardAlreadyBeenIssued(achievementId, milestonesClaimed = []) {
  return milestonesClaimed.some(entry => entry.achievementId === achievementId);
}

/** Milestone'ы, которые currentStreak уже покрывает, но за которые ещё не выдана награда. */
export function detectNewlyReachedMilestones(loyaltyState, milestonesClaimed = [], config = LOYALTY_CONFIG) {
  const { currentStreak, currentStreakStartDay } = loyaltyState;
  if (!currentStreakStartDay) return [];

  return getReachedMilestones(currentStreak, config)
    .map(m => ({ ...m, achievementId: buildMilestoneAchievementId(m.streakDays, currentStreakStartDay) }))
    .filter(m => !hasMilestoneRewardAlreadyBeenIssued(m.achievementId, milestonesClaimed));
}

export function createRewardFromMilestone(milestone, { nowIso, config = LOYALTY_CONFIG } = {}) {
  const earnedAt = nowIso || new Date().toISOString();
  const expiresInDays = config.reward.expiresInDays;
  const expiresAt = new Date(new Date(earnedAt).getTime() + expiresInDays * 86400000).toISOString();

  return {
    id: `reward_${milestone.achievementId}`,
    type: milestone.rewardType,
    value: milestone.rewardValue,
    title: milestone.title,
    description: milestone.description,
    status: 'available', // 'available' | 'redeemed' | 'expired'
    earnedAt,
    expiresAt,
    redeemedAt: null,
    sourceMilestone: milestone.streakDays,
    achievementId: milestone.achievementId,
  };
}

/**
 * Сверяет вычисленный streak-state с уже сохранёнными milestonesClaimed/rewards
 * и идемпотентно достраивает недостающие награды. Не мутирует входные массивы.
 */
export function reconcileLoyaltyMilestones(loyaltyState, persisted = {}, config = LOYALTY_CONFIG) {
  const milestonesClaimed = persisted.milestonesClaimed || [];
  const rewards = persisted.rewards || [];

  const newlyReached = detectNewlyReachedMilestones(loyaltyState, milestonesClaimed, config);
  if (newlyReached.length === 0) {
    return { milestonesClaimed, rewards, newlyEarnedRewards: [] };
  }

  const nowIso = new Date().toISOString();
  const newRewards = newlyReached.map(m => createRewardFromMilestone(m, { nowIso, config }));
  const newClaims = newlyReached.map(m => ({
    milestone: m.streakDays,
    achievementId: m.achievementId,
    achievedAt: nowIso,
    rewardId: `reward_${m.achievementId}`,
  }));

  return {
    milestonesClaimed: [...milestonesClaimed, ...newClaims],
    rewards: [...rewards, ...newRewards],
    newlyEarnedRewards: newRewards,
  };
}

export function getAvailableRewards(rewards = []) {
  const now = Date.now();
  return rewards.filter(r => r.status === 'available' && (!r.expiresAt || new Date(r.expiresAt).getTime() > now));
}

// ---------------------------------------------------------------------------
// 4. Применение награды в корзине
// ---------------------------------------------------------------------------

export function isRewardApplicable(reward, cart, config = LOYALTY_CONFIG) {
  if (!reward || reward.status !== 'available') return false;
  if (reward.expiresAt && new Date(reward.expiresAt).getTime() <= Date.now()) return false;
  if (reward.type === 'free_dessert') {
    return Object.values(cart || {}).some(item => item.menuCategory === DESSERT_CATEGORY);
  }
  return false;
}

/**
 * free_dessert покрывает самый дешёвый товар категории "dessert" в корзине
 * (config.rewardEligibilityStrategy) — награда не применима, если десерта в
 * корзине нет (см. isRewardApplicable).
 */
export function getEligibleCartItemsForReward(cart, reward, config = LOYALTY_CONFIG) {
  if (!isRewardApplicable(reward, cart, config)) return [];
  const items = Object.values(cart || {});

  if (config.rewardEligibilityStrategy === 'cheapest_dessert') {
    const desserts = items.filter(item => item.menuCategory === DESSERT_CATEGORY);
    const cheapest = desserts.reduce((min, item) => (
      !min || item.unitPrice < min.unitPrice ? item : min
    ), null);
    return cheapest ? [cheapest] : [];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Production security note (см. ТЗ п.18/42):
// Всё в этом файле — клиентская реализация, достаточная для MVP/прототипа.
// Источником истины для production обязан стать backend: серверный timestamp
// вместо системного времени телефона, серверный расчёт businessDay, уникальность
// (userId, businessDay) на уровне БД, идемпотентная выдача наград и валидация
// redemption. Чтобы подключить backend позже, достаточно заменить
// loyalty/loyaltyStorage.js (сейчас — AsyncStorage) на репозиторий поверх API,
// сохранив тот же контракт полей (visitedDays/rewards/milestonesClaimed) —
// остальной domain-код (этот файл) менять не придётся.
