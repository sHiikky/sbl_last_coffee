import assert from 'node:assert/strict';
import { normalizeLoyaltySnapshot } from './loyaltySnapshot.js';
import { LOYALTY_CONFIG } from './loyaltyConfig.js';
import {
  deriveVisitedDaysFromOrders, computeLoyaltyStateFromVisitedDays,
  reconcileLoyaltyMilestones, getAvailableRewards, isRewardApplicable,
} from './loyaltyService.js';
import { addBusinessDays } from './loyaltyDate.js';
import { DESSERT_CATEGORY } from '../data/products.js';

const days = Array.from({ length: 30 }, (_, i) => addBusinessDays('2026-09-01', i));
const state = computeLoyaltyStateFromVisitedDays(days, LOYALTY_CONFIG, days.at(-1));
const granted = reconcileLoyaltyMilestones(state, {}, LOYALTY_CONFIG);
assert.equal(state.currentStreak, 30);
assert.deepEqual(granted.rewards.map(r => r.sourceMilestone), [10, 20, 30]);
assert.equal(new Set(granted.rewards.map(r => r.id)).size, 3);
assert.equal(reconcileLoyaltyMilestones(state, granted, LOYALTY_CONFIG).newlyEarnedRewards.length, 0);
assert.equal(computeLoyaltyStateFromVisitedDays([...days, '2026-10-02'], LOYALTY_CONFIG).currentStreak, 1);

assert.deepEqual(deriveVisitedDaysFromOrders([
  { status: 'new', createdAt: '2026-10-05T10:00:00Z' },
  { status: 'cancelled', completedAt: '2026-10-05T10:00:00Z' },
  { status: 'completed', createdAt: '2026-10-04T16:00:00Z', completedAt: '2026-10-04T17:05:00Z' },
  { status: 'completed', completedAt: '2026-10-05T10:00:00Z' },
]), ['2026-10-05']);

const server = {
  customerId: 'user-a', today: '2026-10-05', serverNow: '2026-10-05T10:00:00Z',
  currentStreak: 30, visitedDays: days,
  rewards: [
    { id: 'one', type: 'free_dessert', status: 'available', expiresAt: '2026-10-06T10:00:00Z' },
    { id: 'two', status: 'redeemed', redeemedOrderId: 'order-two', expiresAt: '2026-10-06T10:00:00Z' },
    { id: 'three', status: 'expired', expiresAt: '2026-10-01T10:00:00Z' },
  ],
};
assert.throws(() => normalizeLoyaltySnapshot(server, 'user-b'), /SESSION_CHANGED/);
assert.throws(() => normalizeLoyaltySnapshot(null, 'user-a'), /SESSION_CHANGED/);
const normalized = normalizeLoyaltySnapshot(server, 'user-a');
const originalNow = Date.now;
try {
  Date.now = () => Date.parse('2099-01-01T00:00:00Z');
  assert.deepEqual(getAvailableRewards(normalized.rewards).map(r => r.id), ['one']);
  assert.equal(isRewardApplicable(normalized.rewards[0], { dessert: { menuCategory: DESSERT_CATEGORY } }), true);
} finally { Date.now = originalNow; }
assert.equal(normalized.rewards[1].redeemedOrderId, 'order-two');
assert.equal(normalized.rewards[0].serverExpiresAt, server.rewards[0].expiresAt);
assert.deepEqual(normalized.cycleProgress, { cycle: 3, progress: 10, cycleLength: 10 });
console.log('PASS: recurring gifts, continuous streak, deduplication, gaps, first completion day in Tomsk, user isolation, server-clock eligibility, actual consumed reward');
