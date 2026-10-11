import { getCycleProgress } from './loyaltyService.js';

export function normalizeLoyaltySnapshot(data, customerId) {
  if (!customerId || !data || data.customerId !== customerId) throw new Error('LOYALTY_SESSION_CHANGED');
  if (!Array.isArray(data.rewards) || !Array.isArray(data.visitedDays) || !data.today) {
    throw new Error('LOYALTY_INVALID_SNAPSHOT');
  }
  return {
    ...data,
    cycleProgress: getCycleProgress(data.currentStreak),
    milestonesClaimed: [],
    // Eligibility uses the server's status, never the phone's clock.
    rewards: data.rewards.map(reward => ({
      ...reward, serverExpiresAt: reward.expiresAt, expiresAt: null,
    })),
  };
}
