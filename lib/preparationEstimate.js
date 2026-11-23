export const PREPARATION_MS = 5 * 60 * 1000;

// update_order_status sets updated_at on the server. During preparing there
// are no client-side order writes; polling/navigation cannot restart this clock.
export function preparationEstimate(status, changedAt, now = Date.now()) {
  if (status !== 'preparing') return null;
  const start = Date.parse(changedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  const remaining = Math.max(0, Math.min(PREPARATION_MS, start + PREPARATION_MS - now));
  const seconds = Math.ceil(remaining / 1000);
  return { seconds, progress: 1 - remaining / PREPARATION_MS, label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, overdue: remaining === 0 };
}
