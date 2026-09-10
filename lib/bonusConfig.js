// lib/bonusConfig.js
// Клиентское зеркало правил из supabase/migrations/20260822120000_bonus_program.sql
// (функция bonus_rate_for). Используется ТОЛЬКО для UI-предпросчёта (прогресс
// до уровня, оценка кэшбека в корзине до оформления) — реальное начисление
// и итоговый уровень всегда считает бэкенд при переходе заказа в completed,
// это клиентское зеркало никогда не пишет и не является источником истины.
export const BONUS_LEVELS = [
  { level: 1, threshold: 0, maxThreshold: 10000, rate: 0.05 },
  { level: 2, threshold: 10000, maxThreshold: 30000, rate: 0.10 },
  { level: 3, threshold: 30000, maxThreshold: null, rate: 0.15 },
];

// 1 бонус = 1₽, списать можно максимум эту долю от суммы заказа.
export const BONUS_REDEEM_MAX_SHARE = 0.5;

export function getBonusLevel(lifetimePaid) {
  if (lifetimePaid > 30000) return BONUS_LEVELS[2];
  if (lifetimePaid > 10000) return BONUS_LEVELS[1];
  return BONUS_LEVELS[0];
}

// progress: доля пути внутри ТЕКУЩЕГО уровня до следующего порога (0..1).
// toNextLevel: сколько ещё нужно потратить деньгами, null на максимальном уровне.
export function getLevelProgress(lifetimePaid) {
  const level = getBonusLevel(lifetimePaid);
  if (level.maxThreshold == null) {
    return { level, toNextLevel: null, progress: 1 };
  }
  const span = level.maxThreshold - level.threshold;
  const done = Math.max(0, Math.min(span, lifetimePaid - level.threshold));
  return {
    level,
    toNextLevel: Math.max(0, level.maxThreshold - lifetimePaid),
    progress: span > 0 ? done / span : 1,
  };
}

export function maxRedeemable(total, balance) {
  return Math.max(0, Math.min(balance, Math.floor(total * BONUS_REDEEM_MAX_SHARE)));
}
