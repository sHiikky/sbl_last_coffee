// lib/orderService.js
// Единственная точка входа для создания заказа с клиента. Цена/итоговая
// сумма НЕ доверяются мобильному приложению: вся логика — один Postgres RPC
// create_order() (см.
// supabase/migrations/20260911120000_atomic_order_creation.sql), который
// сам достаёт актуальную цену каждой позиции из products, сам считает
// subtotal/discount/total и создаёт orders+order_items одной атомарной
// транзакцией.
//
// RECOVER / RETRY (Block 1.2, уточнено в Block 1.3):
//   RECOVER (recoverPendingCheckoutOnce) — ЧИСТО read-only: get_order_by_
//     idempotency_key, никогда не вызывает create_order(). Наличие
//     незавершённой попытки означает лишь "клиент не знает исход
//     предыдущего запроса" — это НЕ согласие пользователя на создание
//     заказа сейчас.
//   RETRY (createOrder) — единственная функция, которая может создать
//     заказ. Вызывается только из CartScreen.handleOrder в ответ на
//     реальное нажатие "Оформить заказ".
//
// Block 1.3: recoverPendingCheckoutOnce теперь вызывается НЕ только из
// App.js при старте, а из нескольких триггеров (старт, возврат приложения
// на передний план, фокус экрана корзины, явная попытка оформить НОВЫЙ,
// отличающийся заказ поверх ещё не разрешённой старой попытки) — при этом
// он остаётся единственной read-only точкой, всегда single-flight и
// idempotent, и по-прежнему НИКОГДА не создаёт заказ. "Владелец" recovery —
// это не конкретный экран, а эта функция: кто бы её ни вызвал, поведение и
// побочные эффекты (что писать/чистить в AsyncStorage) одни и те же;
// интерпретацию результата (setActiveOrder и т.п.) централизует App.js
// (см. applyCheckoutRecoveryResult там) — CartScreen сам стейт не меняет.
export const CHECKOUT_ATTEMPT_STATE = Object.freeze({
  SUBMITTING: 'submitting', // запрос в полёте — исход ещё не известен
  UNKNOWN: 'unknown',       // сеть/таймаут — не ясно, дошёл ли запрос до сервера
  CONFIRMED: 'confirmed',   // сервер подтвердил результат — запись можно удалять сразу после обработки
  FAILED: 'failed',         // сервер ОКОНЧАТЕЛЬНО отклонил (детерминированная ошибка валидации)
});

// ── Block 1.3/1.4: два РАЗНЫХ понятия, которые управляют РАЗНЫМИ решениями ──
//
// CHECKOUT_UNCERTAINTY_WINDOW_MS — ЕДИНСТВЕННОЕ, что решает, можно ли уже
// считать "заказа не найдено" окончательным ответом. Пока попытка младше
// этого окна, read-only lookup, вернувший "нет заказа", НЕ окончателен —
// исходный create_order() теоретически мог ещё выполняться (плохая сеть,
// медленный ответ) — и стоит сделать ещё пару read-only lookup с bounded
// backoff, а не сразу разрешать новый checkout. Как только попытка старше
// этого окна, а lookup всё равно возвращает "нет заказа" — это уже
// ОКОНЧАТЕЛЬНЫЙ отрицательный результат: попытка закрывается, новый
// checkout разрешается СРАЗУ (Block 1.4, п.1 — это было главной ошибкой
// Block 1.3: решение по ошибке опиралось на retention TTL, из-за чего
// пользователь мог быть заблокирован на часы вместо полутора минут). 90
// секунд — с запасом покрывает типичный таймаут мобильного запроса + пару
// ретраев транспорта.
export const CHECKOUT_UNCERTAINTY_WINDOW_MS = 90 * 1000;

// Не более 2 дополнительных read-only lookup внутри uncertainty window,
// с bounded backoff (3с, затем ещё +10с) — это НЕ polling (нет
// периодического таймера, который живёт неограниченно): после этих двух
// попыток (или после истечения uncertainty window) дальнейшие lookup
// происходят только по реальным триггерам (foreground, фокус экрана
// корзины, явное действие пользователя).
export const CHECKOUT_RECOVERY_BOUNDED_RETRY_DELAYS_MS = [3000, 10000];

// CHECKOUT_ATTEMPT_RETENTION_TTL_MS — ТОЛЬКО максимальный срок хранения
// recovery-метаданных локально (hard cleanup policy). НЕ решает, можно ли
// оформить новый заказ — это решает исключительно CHECKOUT_UNCERTAINTY_WINDOW_MS
// выше (Block 1.4, п.1/п.2). Единственная роль этой константы: если lookup
// продолжает падать по сети и попытка "зависла" дольше этого срока, клиент
// перестаёт держать её в локальном хранилище — не потому что "заказа точно
// нет" (мы этого не знаем, сеть не отвечает), а потому что бесконечно
// хранить unresolved-метаданные тоже нельзя (см. LOOKUP_FAILED_RETENTION_EXPIRED
// ниже). Для кофейни это НЕ сутки: самовывоз оформляется на ближайшие 15-40
// минут в рамках одного визита. 2 часа — щедрый запас, но на порядок
// меньше прежних 24 часов из Block 1.1/1.2.
export const CHECKOUT_ATTEMPT_RETENTION_TTL_MS = 2 * 60 * 60 * 1000;

// Небольшой (НЕ агрессивный debounce, который портил бы UX) cooldown ТОЛЬКО
// для автоматических триггеров (app foreground, фокус экрана корзины) — не
// даёт двум-трём почти одновременным событиям (foreground сразу за фокусом
// корзины, или несколько focus-событий подряд) выполнить сетевой lookup
// несколько раз за секунды. Single-flight (см. recoveryInFlight ниже)
// защищает только от ОДНОВРЕМЕННЫХ вызовов — если lookup #1 уже завершился,
// а lookup #2 приходит спустя 100-500мс, single-flight его не остановит,
// это и есть работа cooldown'а. НЕ применяется к явным пользовательским
// действиям (см. recoverPendingCheckoutOnce({ auto })) и не применяется к
// bounded-retry burst'у (у него своя, отдельная, более редкая бюджетная
// схема — CHECKOUT_RECOVERY_BOUNDED_RETRY_DELAYS_MS).
export const RECOVERY_AUTO_CHECK_COOLDOWN_MS = 2500;

// Единый, однозначный набор исходов recoverPendingCheckoutOnce (Block 1.4,
// п.8) — устраняет путаницу предыдущих версий между "not_found" (в смысле
// "пока не знаем") и "not_found_stale" (в смысле retention TTL, что было
// неверно завязано на решение о повторном checkout).
export const CHECKOUT_RECOVERY_OUTCOME = Object.freeze({
  NONE: 'none',                                             // NO_PENDING_ATTEMPT — нечего восстанавливать
  FOUND_ACTIVE: 'found_active',                             // заказ найден, статус не финальный — можно поднимать как activeOrder
  FOUND_TERMINAL: 'found_terminal',                         // заказ найден, но уже completed/cancelled — activeOrder не поднимаем
  NOT_FOUND_UNCERTAIN: 'not_found_uncertain',               // моложе CHECKOUT_UNCERTAINTY_WINDOW_MS — рано считать окончательным
  NOT_FOUND_FINAL: 'not_found_final',                       // старше окна и уверенно не найден — попытка закрыта, новый checkout разрешён
  LOOKUP_FAILED: 'lookup_failed',                           // сетевая/иная ошибка lookup, попытка НЕ трогается
  LOOKUP_FAILED_RETENTION_EXPIRED: 'lookup_failed_retention_expired', // сеть недоступна и retention TTL уже истёк — локальный трекинг прекращён (см. комментарий у константы выше), НЕ равносильно "заказа нет"
  THROTTLED: 'throttled',                                   // анти-hot-loop cooldown (см. RECOVERY_AUTO_CHECK_COOLDOWN_MS), только для auto:true
});

// Единственный источник истины для "финальный ли статус заказа" — раньше
// (Block 1.2 и раньше) дублировался как ACTIVE_ORDER_FINAL_STATUSES прямо
// в App.js. Новых статусов не выдумываю — тот же список, что реально
// использовался в App.js.refreshActiveOrder(). Если/когда в проекте
// появится общий доменный слой типов (см. Block 0 аудит, TypeScript
// priority — Order/OrderStatus помечены P1), этот список стоит перенести
// туда как единый enum/STATUS_META вместо константы в lib/orderService.js.
export const ORDER_FINAL_STATUSES = ['completed', 'cancelled'];

export function isOrderStatusTerminal(status) {
  return ORDER_FINAL_STATUSES.includes(status);
}

// Ошибки, которые сервер вернул ОКОНЧАТЕЛЬНО (валидация payload'а) — здесь
// нет неопределённости: сервер точно обработал запрос и точно не создал
// заказ (кроме IDEMPOTENCY_CONFLICT, который тоже детерминирован — сервер
// точно знает, что это другой payload под тем же ключом). Такие ошибки НЕ
// требуют recovery-lookup при следующем запуске.
//
// Block 1.3, п.6 — ERROR CONTRACT: это по-прежнему парсинг человекочитаемой
// строки исключения (SQL raise exception 'КОД: текст...', см. миграцию), а
// не структурированный machine-readable envelope или разные SQLSTATE на
// каждый app-код (сейчас использовано несколько стандартных PostgreSQL
// SQLSTATE — 22023/28000/23505 — которые сами по себе не различают,
// например, INVALID_PAYLOAD от INVALID_QUANTITY). Полноценно менять это
// сейчас — заметно больший scope (нужно трогать SQL error-contract и,
// вероятно, версию Postgres-клиента). Вместо этого парсинг СОЗНАТЕЛЬНО
// изолирован в ОДНОЙ функции — classifyOrderError() ниже — это
// единственное место во всём приложении, которое смотрит на текст ошибки.
// Дальнейший hardening (структурированный result/error envelope от
// create_order(), например через отдельное поле jsonb, или уникальный
// SQLSTATE на каждый app-код) — следующий шаг, не сделанный в этом блоке.
const DETERMINISTIC_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'INVALID_PAYLOAD',
  'INVALID_QUANTITY',
  'PRODUCT_NOT_AVAILABLE',
  'IDEMPOTENCY_CONFLICT',
];

import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const PENDING_ATTEMPT_STORAGE_KEY = 'sbl_pending_checkout_attempt';
// Версия 2 (Block 1.2) — добавлено поле `state`. Формат не менялся в
// Block 1.3 (только политика вокруг него), версия остаётся 2.
const PENDING_ATTEMPT_VERSION = 2;

/**
 * UUID v4 через expo-crypto (Crypto.randomUUID()) — официальный способ на
 * Expo SDK 54, без ручной реализации на Math.random(). Требует
 * зависимости "expo-crypto" в package.json (добавлена этим же блоком,
 * `npx expo install expo-crypto`).
 */
export function generateIdempotencyKey() {
  return Crypto.randomUUID();
}

function toCanonicalItems(items) {
  return (items || [])
    .map(item => ({ id: String(item.id), qty: Number(item.qty) }))
    .filter(item => item.id && Number.isFinite(item.qty) && item.qty > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Канонический, порядок-независимый "отпечаток" одной попытки оформления —
 * используется ТОЛЬКО локально на клиенте, чтобы решить (а) "корзина с
 * момента исходной попытки не изменилась" (см. recoverPendingCheckoutOnce,
 * matchesCurrentCart) и (б) "это retry той же попытки или уже другая,
 * независимая" (см. checkoutAttemptRef в CartScreen.js и conflict-check в
 * handleOrder). Финальное слово всегда за сервером: create_order() считает
 * свой собственный fingerprint (jsonb, см. миграцию) и явно отказывает
 * (IDEMPOTENCY_CONFLICT), если содержимое под тем же ключом не совпадает —
 * сервер НИКОГДА не принимает готовый fingerprint от клиента как параметр
 * и не доверяет ему, поэтому байт-в-байт совпадение с серверным алгоритмом
 * здесь не обязательно, важна только внутренняя согласованность на клиенте.
 *
 * Block 1.3, п.5 — CART CLEANUP SEMANTICS: намеренно учитывает ТОЛЬКО
 * товары (product id + qty; опций/модификаторов у товаров сейчас нет — см.
 * Block 0 аудит, "в реальном меню СБИС у каждого варианта уже отдельная
 * позиция со своей ценой"). promoCode/rewardRequested/bonusRedeem тоже
 * входят в этот fingerprint (нужны, чтобы отличить retry от новой
 * попытки), НО решение "можно ли безопасно очистить cart items при
 * найденном заказе" (см. isSameCanonicalItems ниже) сверяет ТОЛЬКО items,
 * а не промокод/награду/бонусы — если пользователь просто передумал
 * применять промокод, не поменяв состав корзины, восстановленный заказ
 * всё равно корректно "соответствует" текущей корзине с точки зрения
 * cart-очистки (сами товары те же, изменение промокода уже не имеет
 * значения — заказ этот уже создан с теми параметрами, что были на
 * момент создания).
 */
export function buildRequestFingerprint({ items, promoCode, rewardRequested, bonusRedeem }) {
  return JSON.stringify({
    items: toCanonicalItems(items).map(item => [item.id, item.qty]),
    promoCode: promoCode || null,
    rewardRequested: !!rewardRequested,
    bonusRedeem: Number(bonusRedeem || 0),
  });
}

/**
 * Разбирает ошибку create_order()/RPC на "сервер ответил окончательно"
 * (deterministic — сообщение с одним из известных префиксов, см.
 * DETERMINISTIC_ERROR_CODES в миграции) против "неизвестно, дошёл ли запрос
 * и что решил сервер" (network/timeout/любая другая ошибка — unknown).
 * Используется CartScreen.handleOrder, чтобы решить: очищать
 * pending-attempt сразу (deterministic) или оставить его в состоянии
 * `unknown` для будущего recovery-lookup (см. Block 1.2, п.6).
 *
 * Смотрит не только на error.message, но и на error.details/error.hint —
 * supabase-js в разных версиях/путях может положить текст исключения в
 * любое из этих полей. Это ЕДИНСТВЕННОЕ место в приложении, которое
 * парсит текст ошибки (см. комментарий у DETERMINISTIC_ERROR_CODES выше
 * про будущий structured error contract).
 *
 * @returns {{ type: 'deterministic' | 'unknown', code: string | null }}
 */
export function classifyOrderError(error) {
  const haystack = [error?.message, error?.details, error?.hint, error?.error_description, String(error || '')]
    .filter(Boolean)
    .join(' | ');
  for (const code of DETERMINISTIC_ERROR_CODES) {
    if (haystack.includes(code)) {
      return { type: 'deterministic', code };
    }
  }
  return { type: 'unknown', code: null };
}

/**
 * Создаёт заказ через серверный RPC. Бросает исключение при любой ошибке
 * (сеть, серверная валидация, неизвестный товар, IDEMPOTENCY_CONFLICT и
 * т.д.) — вызывающий код ловит её так же, как раньше ловил ошибку insert, и
 * решает, что делать, через classifyOrderError().
 *
 * ЭТО ЕДИНСТВЕННАЯ функция в этом файле, которая может СОЗДАТЬ заказ
 * (RETRY). Вызывается только из CartScreen.handleOrder в ответ на реальное
 * действие пользователя — никогда автоматически при старте/foreground/
 * фокусе экрана.
 */
export async function createOrder({
  idempotencyKey,
  items,
  promoCode = null,
  rewardRequested = false,
  bonusRedeem = 0,
}) {
  if (!idempotencyKey) {
    throw new Error('createOrder: idempotencyKey обязателен.');
  }

  const payloadItems = toCanonicalItems(items).map(item => ({
    product_id: item.id,
    quantity: item.qty,
  }));

  const { data, error } = await supabase.rpc('create_order', {
    p_idempotency_key: idempotencyKey,
    p_items: payloadItems,
    p_promo_code: promoCode || null,
    p_reward_requested: !!rewardRequested,
    p_bonus_redeem: bonusRedeem || 0,
  });

  if (error) throw error;

  // returns table(...) — supabase-js отдаёт массив строк даже для одной строки.
  const order = Array.isArray(data) ? data[0] : data;
  if (!order) throw new Error('Сервер не вернул созданный заказ.');
  return order;
}

/**
 * Read-only lookup через get_order_by_idempotency_key() (см. миграцию,
 * секция 5). НИКОГДА не создаёт заказ — используется только для RECOVER.
 * Возвращает null, если заказа с таким ключом у текущего пользователя нет.
 */
export async function getOrderByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) return null;

  const { data, error } = await supabase.rpc('get_order_by_idempotency_key', {
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;

  const order = Array.isArray(data) ? data[0] : data;
  return order || null;
}

// ───────────────────────────────────────────────────────────────────────
// Persistent pending checkout attempt — состояние одной (и ТОЛЬКО одной,
// см. Block 1.3 п.1) незавершённой попытки оформления заказа.
// ───────────────────────────────────────────────────────────────────────

async function writeAttempt(attempt) {
  await AsyncStorage.setItem(PENDING_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  return attempt;
}

export async function savePendingCheckoutAttempt({
  idempotencyKey,
  items,
  promoCode,
  rewardRequested,
  bonusRedeem,
  state = CHECKOUT_ATTEMPT_STATE.SUBMITTING,
}) {
  const canonicalItems = toCanonicalItems(items);
  const attempt = {
    version: PENDING_ATTEMPT_VERSION,
    idempotencyKey,
    fingerprint: buildRequestFingerprint({ items: canonicalItems, promoCode, rewardRequested, bonusRedeem }),
    payload: {
      items: canonicalItems,
      promoCode: promoCode || null,
      rewardRequested: !!rewardRequested,
      bonusRedeem: Number(bonusRedeem || 0),
    },
    state,
    createdAt: new Date().toISOString(),
  };
  return writeAttempt(attempt);
}

export async function getPendingCheckoutAttempt() {
  const raw = await AsyncStorage.getItem(PENDING_ATTEMPT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.version !== PENDING_ATTEMPT_VERSION ||
      !parsed?.idempotencyKey ||
      !parsed?.payload ||
      !Object.values(CHECKOUT_ATTEMPT_STATE).includes(parsed?.state)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingCheckoutAttempt() {
  await AsyncStorage.removeItem(PENDING_ATTEMPT_STORAGE_KEY);
}

/**
 * Переводит текущую сохранённую попытку (если она есть и это тот же ключ)
 * в новое состояние, не трогая остальные поля. Используется CartScreen.js
 * после ответа сервера (classifyOrderError -> UNKNOWN) и
 * recoverPendingCheckoutOnce (NOT_FOUND_UNCERTAIN, попытка ещё младше
 * uncertainty window) — сама попытка НЕ удаляется, только помечается.
 */
export async function markPendingCheckoutAttemptState(idempotencyKey, state) {
  if (!Object.values(CHECKOUT_ATTEMPT_STATE).includes(state)) {
    throw new Error(`markPendingCheckoutAttemptState: неизвестное состояние "${state}".`);
  }
  const attempt = await getPendingCheckoutAttempt();
  if (!attempt || attempt.idempotencyKey !== idempotencyKey) return null;
  return writeAttempt({ ...attempt, state });
}

function isSameCanonicalItems(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

// Single-flight guard: recoverPendingCheckoutOnce может быть вызван из
// нескольких мест почти одновременно — старт приложения, возврат на
// передний план, фокус экрана корзины, bounded-retry таймер, явная
// проверка перед оформлением НОВОГО заказа поверх старой незавершённой
// попытки (Block 1.3). Вместо того чтобы полагаться на то, что вызывающий
// код сам не запустит recovery дважды, гарантируем это здесь: конкурентные
// вызовы получают ОДИН и тот же промис, а не независимо бьют по сети/БД.
let recoveryInFlight = null;
// Cooldown-таймстамп для АВТОМАТИЧЕСКИХ ({ auto: true }) триггеров — см.
// RECOVERY_AUTO_CHECK_COOLDOWN_MS выше. Обновляется перед КАЖДЫМ реальным
// сетевым lookup (не только auto:true), чтобы explicit-вызов, случившийся
// прямо перед авто-триггером, тоже не давал тому немедленно задублировать
// сетевой запрос.
let lastRecoveryCheckAt = 0;

/**
 * ЕДИНСТВЕННАЯ read-only точка восстановления/проверки состояния
 * незавершённого checkout. НИКОГДА не вызывает createOrder() — если
 * попытка была отправлена, но сервер её не обработал (или обработал, но
 * ответ потерялся ДО того, как запрос вообще дошёл), эта функция просто
 * констатирует факт — пользователь должен САМ снова нажать "Оформить
 * заказ", чтобы создать заказ (RETRY, см. CartScreen.handleOrder).
 *
 * Единственный "владелец" recovery lifecycle и его side-эффектов (что
 * писать/чистить в AsyncStorage) — эта функция. Она вызывается из
 * нескольких МЕСТ (App.js при старте и при возврате на передний план,
 * CartScreen при получении фокуса экрана, ограниченная серия bounded-
 * backoff ретраев, явная проверка перед перезаписью НЕразрешённой попытки
 * под другой заказ) — но это разные ТРИГГЕРЫ одного и того же
 * централизованного механизма, а не несколько независимых реализаций
 * recovery. Интерпретацию результата (setActiveOrder, уведомления и т.п.)
 * централизует App.js (applyCheckoutRecoveryResult) — вызывающий код
 * никогда сам не решает, что делать с найденным/не найденным заказом,
 * только передаёт результат этой функции дальше.
 *
 * Block 1.4, п.1 — КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: решение "можно ли уже считать
 * отсутствие заказа окончательным" принимается ИСКЛЮЧИТЕЛЬНО по
 * CHECKOUT_UNCERTAINTY_WINDOW_MS (90 секунд), а НЕ по
 * CHECKOUT_ATTEMPT_RETENTION_TTL_MS (2 часа), как ошибочно было в Block
 * 1.3. Retention TTL используется только тогда, когда сеть/сервер вообще
 * не отвечают на lookup (см. LOOKUP_FAILED_RETENTION_EXPIRED ниже) — это
 * НЕ "checkout lock" на 2 часа.
 *
 * @param {{id:string, qty:number}[]} currentCartItems — текущее
 *   содержимое корзины на момент вызова, чтобы решить, совпадает ли она с
 *   той, что была в исходной попытке (если корзина изменилась, чистить её
 *   нельзя, даже если заказ найден).
 * @param {{ auto?: boolean }} [options] — auto:true помечает
 *   "автоматический" фоновый триггер (foreground/фокус), к которому
 *   применяется cooldown (RECOVERY_AUTO_CHECK_COOLDOWN_MS). auto:false
 *   (по умолчанию) — явный/значимый вызов (старт приложения, bounded-retry
 *   burst, conflict-check перед новым заказом), cooldown не применяется.
 * @returns {Promise<
 *   | { outcome: 'none' }
 *   | { outcome: 'found_active', order: object, matchesCurrentCart: boolean }
 *   | { outcome: 'found_terminal', order: object, matchesCurrentCart: boolean }
 *   | { outcome: 'not_found_uncertain' }
 *   | { outcome: 'not_found_final' }
 *   | { outcome: 'lookup_failed', error: unknown }
 *   | { outcome: 'lookup_failed_retention_expired', error: unknown }
 *   | { outcome: 'throttled' }
 * >} — см. CHECKOUT_RECOVERY_OUTCOME для точных значений `outcome`.
 */
export function recoverPendingCheckoutOnce(currentCartItems = [], { auto = false } = {}) {
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    try {
      // Дешёвая ЛОКАЛЬНАЯ проверка ПЕРЕД любым сетевым вызовом (Block 1.4,
      // п.7) — если нечего восстанавливать, ни один из триггеров (включая
      // частый "фокус экрана корзины") не делает сетевой запрос.
      const attempt = await getPendingCheckoutAttempt();
      if (!attempt) return { outcome: CHECKOUT_RECOVERY_OUTCOME.NONE };

      // CONFIRMED/FAILED не должны были остаться в хранилище (CartScreen
      // обязан их удалять сам после обработки) — если всё же остались
      // (например, приложение убито ровно между записью state и удалением),
      // это уже не требует lookup: просто подчищаем и ничего не делаем.
      if (attempt.state === CHECKOUT_ATTEMPT_STATE.CONFIRMED || attempt.state === CHECKOUT_ATTEMPT_STATE.FAILED) {
        await clearPendingCheckoutAttempt();
        return { outcome: CHECKOUT_RECOVERY_OUTCOME.NONE };
      }

      // Только SUBMITTING/UNKNOWN реально нуждаются в проверке — это
      // единственные состояния, где неизвестно, создал ли сервер заказ.
      if (attempt.state !== CHECKOUT_ATTEMPT_STATE.SUBMITTING && attempt.state !== CHECKOUT_ATTEMPT_STATE.UNKNOWN) {
        return { outcome: CHECKOUT_RECOVERY_OUTCOME.NONE };
      }

      if (auto) {
        const sinceLast = Date.now() - lastRecoveryCheckAt;
        if (sinceLast < RECOVERY_AUTO_CHECK_COOLDOWN_MS) {
          // Block 1.4, п.4/E — ещё один автоматический триггер (foreground,
          // фокус) сработал почти сразу после предыдущего реального
          // lookup'а: не дублируем сетевой запрос.
          return { outcome: CHECKOUT_RECOVERY_OUTCOME.THROTTLED };
        }
      }

      // Таймстамп обновляется непосредственно перед сетевым вызовом — и для
      // auto, и для explicit — чтобы они тоже не дублировали друг друга,
      // если случились почти одновременно.
      lastRecoveryCheckAt = Date.now();

      let order = null;
      try {
        order = await getOrderByIdempotencyKey(attempt.idempotencyKey);
      } catch (error) {
        console.warn('[order] recovery lookup failed', error);

        const ageMs = Date.now() - new Date(attempt.createdAt).getTime();
        const isRetentionExpired = !Number.isFinite(ageMs) || ageMs > CHECKOUT_ATTEMPT_RETENTION_TTL_MS;

        if (isRetentionExpired) {
          // Block 1.4, п.2: сеть недоступна УЖЕ дольше максимального срока
          // хранения recovery-метаданных. Это НЕ "заказа точно нет" (мы
          // так и не смогли спросить сервер) — это решение перестать
          // бесконечно хранить и пытаться разрешить эту попытку локально.
          // Новый checkout не блокируем (см. applyCheckoutRecoveryResult в
          // App.js — для этого исхода тоже показываем нейтральное
          // уведомление и разрешаем оформить заказ заново).
          await clearPendingCheckoutAttempt();
          return { outcome: CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED_RETENTION_EXPIRED, error };
        }

        // Попытка НЕ трогается — повторим при следующем реальном триггере
        // (foreground/фокус/явное действие) или ограниченном bounded-retry.
        return { outcome: CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED, error };
      }

      if (order) {
        // Заказ действительно существует на сервере — попытка разрешена и
        // удаляется из хранилища независимо от того, активен заказ или уже
        // в финальном статусе (терминальность решает только то, поднимать
        // ли его как activeOrder, а не то, разрешена ли попытка).
        await clearPendingCheckoutAttempt();

        const currentCanonical = toCanonicalItems(currentCartItems);
        const matchesCurrentCart = isSameCanonicalItems(currentCanonical, attempt.payload.items);
        const isTerminal = isOrderStatusTerminal(order.status);

        return {
          outcome: isTerminal ? CHECKOUT_RECOVERY_OUTCOME.FOUND_TERMINAL : CHECKOUT_RECOVERY_OUTCOME.FOUND_ACTIVE,
          order,
          matchesCurrentCart,
        };
      }

      // Заказа нет. Block 1.4, п.1 — единственное, что решает, окончателен
      // ли этот отрицательный результат: uncertainty window, а НЕ retention
      // TTL. Моложе окна — исходный create_order() теоретически ещё мог
      // выполняться, рано считать попытку несостоявшейся. Старше окна —
      // сервер уверенно не видит заказа, дальше ждать бессмысленно: закрываем
      // попытку и разрешаем пользователю новый checkout НЕМЕДЛЕННО (не через
      // 2 часа).
      const ageMs = Date.now() - new Date(attempt.createdAt).getTime();
      const isWithinUncertaintyWindow = Number.isFinite(ageMs) && ageMs < CHECKOUT_UNCERTAINTY_WINDOW_MS;

      if (isWithinUncertaintyWindow) {
        await markPendingCheckoutAttemptState(attempt.idempotencyKey, CHECKOUT_ATTEMPT_STATE.UNKNOWN);
        return { outcome: CHECKOUT_RECOVERY_OUTCOME.NOT_FOUND_UNCERTAIN };
      }

      await clearPendingCheckoutAttempt();
      return { outcome: CHECKOUT_RECOVERY_OUTCOME.NOT_FOUND_FINAL };
    } catch (error) {
      // Acceptance-сценарий G: любое НЕПРЕДВИДЕННОЕ исключение внутри
      // recovery (а не только ожидаемая сетевая ошибка lookup выше) не
      // должно провалиться "наружу" необработанным и тем более не должно
      // оставить single-flight lock занятым навсегда — captured здесь, lock
      // снимается в finally ниже в любом случае.
      console.warn('[order] unexpected error during checkout recovery', error);
      return { outcome: CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED, error };
    } finally {
      recoveryInFlight = null;
    }
  })();

  return recoveryInFlight;
}

// Исходы recoverPendingCheckoutOnce, которые означают "попытка больше не
// pending" — если bounded-retry таймер видит один из них, дальнейшие ещё не
// сработавшие таймеры этой же серии уже бессмысленны (Block 1.4, п.5/F).
const RESOLVED_RECOVERY_OUTCOMES = [
  CHECKOUT_RECOVERY_OUTCOME.NONE,
  CHECKOUT_RECOVERY_OUTCOME.FOUND_ACTIVE,
  CHECKOUT_RECOVERY_OUTCOME.FOUND_TERMINAL,
  CHECKOUT_RECOVERY_OUTCOME.NOT_FOUND_FINAL,
  CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED_RETENTION_EXPIRED,
];

/**
 * Планирует ограниченную серию из CHECKOUT_RECOVERY_BOUNDED_RETRY_DELAYS_MS.length
 * read-only lookup'ов (сейчас: 2, через 3с и 10с) сразу после того, как
 * попытка стала UNKNOWN — НЕ бесконечный polling: после этих двух попыток
 * дальнейшие проверки происходят только по реальным триггерам (foreground,
 * фокус экрана корзины, явное действие пользователя).
 *
 * Каждый запланированный ретрай перед вызовом сверяет, что попытка с тем же
 * idempotencyKey всё ещё лежит в хранилище и всё ещё SUBMITTING/UNKNOWN
 * (иначе она уже была разрешена другим триггером — таймер молча
 * завершается, ничего не запрашивая по сети). Собственно решение "уже
 * можно считать окончательным NOT FOUND или ещё рано" целиком делегировано
 * recoverPendingCheckoutOnce (единственное место с этой логикой, см.
 * CHECKOUT_UNCERTAINTY_WINDOW_MS) — здесь не дублируется.
 *
 * Как только ОДИН из запланированных ретраев видит "попытка разрешена"
 * (см. RESOLVED_RECOVERY_OUTCOMES), все остальные ещё не сработавшие
 * таймеры этой серии отменяются немедленно (Block 1.4, п.5/F) — не ждут,
 * когда сработают сами и обнаружат то же самое.
 *
 * Вызывается из App.js (единственное место, которое держит долгоживущий
 * контекст на время жизни приложения) сразу после того, как CartScreen
 * сигнализирует о переходе попытки в UNKNOWN.
 *
 * @returns {() => void} функция отмены всех ещё не сработавших таймеров
 *   (вызвать при размонтировании владельца, чтобы не осталось "висячих"
 *   setTimeout).
 */
export function scheduleBoundedCheckoutRecoveryRetries({ idempotencyKey, getCartItems, onResult }) {
  const timers = [];
  const cancelAll = () => timers.forEach(clearTimeout);

  CHECKOUT_RECOVERY_BOUNDED_RETRY_DELAYS_MS.forEach(delay => {
    const timerId = setTimeout(async () => {
      try {
        const attempt = await getPendingCheckoutAttempt();
        // Уже разрешена (другим триггером) или это уже другая попытка —
        // нечего делать, таймер молча завершается без сетевого запроса.
        if (!attempt || attempt.idempotencyKey !== idempotencyKey) return;
        if (attempt.state !== CHECKOUT_ATTEMPT_STATE.SUBMITTING && attempt.state !== CHECKOUT_ATTEMPT_STATE.UNKNOWN) return;

        const result = await recoverPendingCheckoutOnce(getCartItems?.() || [], { auto: false });
        onResult?.(result);

        if (RESOLVED_RECOVERY_OUTCOMES.includes(result.outcome)) {
          cancelAll(); // остальным таймерам этой серии больше нечего проверять
        }
      } catch (error) {
        console.warn('[order] bounded recovery retry failed', error);
      }
    }, delay);
    timers.push(timerId);
  });

  return cancelAll;
}
