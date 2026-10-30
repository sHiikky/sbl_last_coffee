import { supabase } from './supabaseClient';

export const CAFE = Object.freeze({ pointId: 'lenina-72', address: 'SBL · Томск, проспект Ленина, 72', timeZone: 'Asia/Tomsk', openHour: 11, closeHour: 20, preparationMin: 3, preparationMax: 5 });

export function normalizeContactPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits[0] === '8') digits = `7${digits.slice(1)}`;
  return /^7\d{10}$/.test(digits) ? `+${digits}` : null;
}

export function validateContact({ name, phone, comment = '' }) {
  const normalized = { name: String(name || '').trim(), phone: normalizeContactPhone(phone), comment: String(comment || '').trim() };
  if (!normalized.name || normalized.name.length > 80) throw new Error('Укажите имя: от 1 до 80 символов.');
  if (!normalized.phone) throw new Error('Укажите российский номер телефона: +7 и 10 цифр.');
  if (normalized.comment.length > 500) throw new Error('Комментарий должен быть не длиннее 500 символов.');
  return normalized;
}

export function getLocalOrderingState(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: CAFE.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return { isOpen: seconds >= 11 * 3600 && seconds + 5 * 60 <= 20 * 3600, serverBacked: false };
}

export async function fetchOrderingConfig() {
  const { data, error } = await supabase.rpc('get_ordering_config');
  if (error) throw error;
  return { ...data, receivedAt: Date.now(), serverBacked: true };
}

export function orderingState(config, deviceNow = Date.now()) {
  if (!config?.server_now) return getLocalOrderingState(new Date(deviceNow));
  const serverNow = Date.parse(config.server_now) + Math.max(0, deviceNow - config.receivedAt);
  return { ...getLocalOrderingState(new Date(serverNow)), serverBacked: true };
}

export function formatPickupTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('ru-RU', { timeZone: CAFE.timeZone, hour: '2-digit', minute: '2-digit' }) : 'Через 3–5 минут';
}

export function checkoutErrorMessage(code) {
  return {
    CAFE_CLOSED: 'Сейчас заказы не принимаются. Кофейня работает с 11:00 до 20:00 по Томску, приём заказов до 19:55.',
    INVALID_CONTACT: 'Проверьте имя, телефон и комментарий к заказу.',
    CONTACT_REQUIRED: 'Укажите имя и телефон для получения заказа.',
    CONTACT_PHONE_MISMATCH: 'Телефон для получения должен совпадать с подтверждённым номером аккаунта.',
    SESSION_CHANGED: 'Пользователь изменился. Проверьте контакт и оформите заказ заново.',
    INVALID_PICKUP: 'Выберите доступное время и точку самовывоза.',
    INVALID_FULFILLMENT: 'Проверьте точку и время самовывоза.',
    INVALID_MODIFIERS: 'Проверьте выбранные добавки и их количество.',
    INVALID_PREPARATION_NOTE: 'Пожелание к позиции должно быть не длиннее 200 символов.',
    MODIFIER_NOT_AVAILABLE: 'Одна из добавок сейчас недоступна. Обновите корзину и проверьте состав.',
    ORDERING_NOT_CONFIGURED: 'Оформление временно недоступно. Обновление сервиса ещё не завершено.',
    NOT_AUTHENTICATED: 'Не удалось восстановить сессию. Проверьте подключение и повторите попытку.',
    INVALID_PAYLOAD: 'Не удалось проверить состав заказа. Обновите корзину.',
    INVALID_QUANTITY: 'Проверьте количество товаров и добавок.',
  }[code] || 'Не удалось подтвердить заказ. Проверьте подключение; мы проверим, был ли он принят, прежде чем оформлять повторно.';
}
