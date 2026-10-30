const META = {
  new: { headline: 'Заказ отправлен', description: 'Ожидает подтверждения кофейни.', icon: 'receipt-outline', step: 0 },
  accepted: { headline: 'Заказ подтверждён', description: 'Кофейня приняла заказ в работу.', icon: 'checkmark-circle-outline', step: 1 },
  preparing: { headline: 'Готовим ваш заказ', description: 'Покажем здесь, когда можно забирать.', icon: 'cafe-outline', step: 2 },
  ready: { headline: 'Можно забирать', description: 'Заказ готов и ждёт вас в кофейне.', icon: 'bag-check-outline', step: 3 },
  completed: { headline: 'Заказ выдан', description: 'Спасибо, что заглянули в SBL.', icon: 'checkmark-done-outline', step: 4 },
  cancelled: { headline: 'Заказ отменён', description: 'Детали заказа доступны в истории.', icon: 'close-outline', step: 4 },
};
const UNKNOWN = { headline: 'Проверяем заказ', description: 'Подтверждённый статус пока не получен.', icon: 'hourglass-outline', step: 0 };

export function orderStatusPresentation(status) {
  return { ...(META[status] || UNKNOWN), isFinal: ['completed', 'cancelled'].includes(status), isCancelled: status === 'cancelled' };
}

function money(value) {
  if (!['number', 'string'].includes(typeof value) || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

// Raw Supabase total is BEFORE bonus redemption. Route/history total is already
// the cash due. Never subtract the bonus a second time from a history snapshot.
export function orderCashDue(details, order) {
  const total = money(details?.total), redeemed = money(details?.bonus_redeemed);
  if (total !== null && redeemed !== null) return redeemed <= total ? Math.round((total - redeemed) * 100) / 100 : null;
  return money(order?.total);
}

export function orderNumberLabel(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = String(value).trim().replace(/^№\s*/, '');
  return number ? `№${number}` : null;
}

export function orderPickupLabel(details, order) {
  const iso = details?.pickup_at || order?.pickupAt;
  if (iso && Number.isFinite(Date.parse(iso))) {
    return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tomsk', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  }
  return typeof order?.pickupTime === 'string' && order.pickupTime.trim() ? order.pickupTime : null;
}
