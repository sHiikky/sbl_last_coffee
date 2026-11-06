import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, FlatList, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import Text from '../components/AppText';
import TextInput from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import ProductImage from '../components/ProductImage';
import QuantityStepper from '../components/QuantityStepper';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import LoyaltyRewardCartCard from '../components/loyalty/LoyaltyRewardCartCard';
import BonusRedeemCartCard from '../components/bonus/BonusRedeemCartCard';
import ProductCard from '../components/ProductCard';
import { colors, spacing, radius, shadow, getHorizontalPadding } from '../theme/tokens';
import { PICKUP_TIMES, PICKUP_POINTS, formatPrice, cartKey } from '../data/products';
import { getAvailableRewards, isRewardApplicable, getEligibleCartItemsForReward } from '../loyalty/loyaltyService';
import { getUserOrThrow } from '../lib/supabaseClient';
import { quotePromo, promoMessage } from '../lib/promoCodes';
import { buildCheckoutQuote, money } from '../lib/checkoutQuote';
import {
  createOrder,
  generateIdempotencyKey,
  buildRequestFingerprint,
  savePendingCheckoutAttempt,
  clearPendingCheckoutAttempt,
  getPendingCheckoutAttempt,
  markPendingCheckoutAttemptState,
  classifyOrderError,
  CHECKOUT_ATTEMPT_STATE,
  CHECKOUT_RECOVERY_OUTCOME,
} from '../lib/orderService';
import useBonusAccount from '../hooks/useBonusAccount';
import { getBonusLevel, maxRedeemable } from '../lib/bonusConfig';
import { CAFE, validateContact, fetchOrderingConfig, orderingState, formatPickupTime, checkoutErrorMessage } from '../lib/ordering';
import { formatAdditions } from '../lib/cartOptions';
import { completePhoneInput, editPhoneInput, formatPhoneInput, PHONE_INPUT_PLACEHOLDER } from '../lib/phoneInput';

function showMessage(title, message) {
  if (Platform.OS === 'web') globalThis.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
}

export default function CartScreen({
  navigation,
  cart,
  onIncrement,
  onDecrement,
  onRefreshCheckout,
  onOrder,
  tabBarHeight,
  // Для блока «С этим берут»: каталог, добавление в корзину, избранное.
  products = [],
  account = null,
  getCurrentCustomerId,
  onAddToCart,
  favoriteIds = [],
  onToggleFavorite,
  loyaltyState,
  onRedeemReward,
  // Block 1.2, п.3: App.js устанавливает это после того, как recovery
  // авторитетно выяснил, что предыдущая попытка не подтвердилась. CartScreen
  // только отображает уведомление и умеет его скрыть.
  checkoutRecoveryNotice = null,
  onDismissCheckoutRecoveryNotice,
  // Block 1.3, п.2/п.1: recovery остаётся read-only и его РЕЗУЛЬТАТ всегда
  // применяет App.js (см. applyCheckoutRecoveryResult там) — но сам ВЫЗОВ
  // recovery теперь может инициировать и этот экран: (а) при получении
  // фокуса (переход пользователя в корзину — один из bounded-триггеров), и
  // (б) явно перед тем, как перезаписать ЕЩЁ не разрешённую попытку под
  // другой, отличающийся заказ (см. handleOrder). CartScreen не решает,
  // что делать с найденным заказом — только передаёт управление в App.js.
  onRequestCheckoutRecovery,
  // Block 1.3, п.3: сигнал в App.js "эта попытка только что стала UNKNOWN"
  // — App.js планирует ограниченную (не polling) серию read-only проверок
  // с bounded backoff, пока приложение остаётся открытым.
  onCheckoutAttemptUncertain,
}) {
  const [promo, setPromo] = useState('');
  const [promoState, setPromoState] = useState(null);
  const [promoQuote, setPromoQuote] = useState(null);
  const [promoError, setPromoError] = useState('');
  const promoRequest = useRef(0);
  const promoSignatureRef = useRef('');
  useEffect(() => () => { promoRequest.current++; }, []);
  const [ordering, setOrdering] = useState(false);
  const [pickupTime] = useState(PICKUP_TIMES[0]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(formatPhoneInput(account?.phone));
  const [orderComment, setOrderComment] = useState('');
  const [orderingConfig, setOrderingConfig] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const [phoneSelection, setPhoneSelection] = useState(undefined);
  const phoneInputRef = useRef({ text: customerPhone, selection: { start: customerPhone.length, end: customerPhone.length } });
  useEffect(() => {
    const text = formatPhoneInput(account?.phone);
    phoneInputRef.current = { text, selection: { start: text.length, end: text.length } };
    setCustomerPhone(text);
    setPhoneSelection(undefined);
  }, [account?.id, account?.phone]);
  const changeCustomerPhone = value => {
    const current = phoneInputRef.current;
    const edited = editPhoneInput(current.text, value, current.selection);
    phoneInputRef.current = edited;
    setCustomerPhone(edited.text);
    setPhoneSelection(edited.selection);
  };
  const changePhoneSelection = event => {
    const selection = event.nativeEvent.selection;
    phoneInputRef.current.selection = selection;
    setPhoneSelection(selection);
  };
  useEffect(() => {
    let active = true;
    const refresh = () => { setClockTick(Date.now()); fetchOrderingConfig().then(config => { if (active) setOrderingConfig(config); }).catch(() => {}); };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const cafeState = orderingState(orderingConfig, clockTick);
  const [pickupPoint] = useState(PICKUP_POINTS[0]);
  const [appliedRewardId, setAppliedRewardId] = useState(null);
  const [redeemBonuses, setRedeemBonuses] = useState(false);
  const [commentExpanded, setCommentExpanded] = useState(false);
  const bonusAccount = useBonusAccount();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const mountedRef = useRef(true);
  // Синхронный guard от двойного тапа — проверяется мгновенно, не дожидаясь
  // ре-рендера с новым `ordering` (см. Block 0 audit, P1 #5). Это только
  // UX-защита: настоящая защита от дублей — серверная идемпотентность ниже.
  const orderingRef = useRef(false);
  // Один idempotency-ключ на одну ПОПЫТКУ оформления, а не на каждый вызов
  // handleOrder — если сервер создал заказ, а ответ потерялся, повторное
  // нажатие "Оформить заказ" с тем же составом корзины должно уйти с тем же
  // ключом, чтобы create_order() на сервере вернул уже существующий заказ, а
  // не создал второй. Новый ключ генерируется только когда состав попытки
  // (товары/промокод/награда/списание бонусов) реально изменился — то есть
  // это уже другая, независимая попытка (см. Block 1 ТЗ, п.4).
  //
  // Это только in-memory кэш на время жизни компонента. Источник истины,
  // переживающий убийство приложения между "сервер создал заказ" и "клиент
  // узнал об этом" — AsyncStorage (см. lib/orderService.js
  // savePendingCheckoutAttempt/recoverPendingCheckoutOnce; recovery-lookup
  // вызывается ИСКЛЮЧИТЕЛЬНО из App.js при старте, не отсюда). При
  // монтировании экрана подхватываем уже сохранённую незавершённую попытку
  // (если она ещё SUBMITTING/UNKNOWN и совпадает с текущей корзиной) —
  // иначе быстрый повторный тап сразу после холодного старта
  // получил бы новый ключ вместо переиспользования старого.
  const checkoutAttemptRef = useRef({ key: null, signature: null });

  // Подхватываем уже сохранённую попытку только если она ещё "в игре"
  // (SUBMITTING/UNKNOWN) — CONFIRMED/FAILED к этому моменту уже должны быть
  // удалены (см. handleOrder ниже), но если по какой-то причине остались,
  // это не повод переиспользовать их ключ для новой попытки.
  useEffect(() => {
    let cancelled = false;
    getPendingCheckoutAttempt().then(attempt => {
      if (cancelled || !attempt) return;
      if (attempt.state !== CHECKOUT_ATTEMPT_STATE.SUBMITTING && attempt.state !== CHECKOUT_ATTEMPT_STATE.UNKNOWN) return;
      checkoutAttemptRef.current = { key: attempt.idempotencyKey, signature: attempt.fingerprint };
    });
    return () => { cancelled = true; };
  }, []);

  const items = Object.values(cart);
  // Всегда актуальная ссылка на текущую корзину для колбэков, которые не
  // должны замыкать устаревшее значение (навигационный listener ниже
  // подписывается один раз, а не на каждый рендер).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Block 1.3, п.2 — "явный переход пользователя в checkout" как bounded
  // recovery trigger: при каждом получении фокуса экраном корзины просим
  // App.js сделать read-only проверку (auto:true — анти-hot-loop throttle
  // не даст этому спамить сеть при частых переключениях вкладок).
  // recoverPendingCheckoutOnce сам по себе бесплатен, если нечего
  // проверять (нет pending-попытки), так что вызывать это на каждый фокус
  // безопасно.
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsubscribe = navigation.addListener('focus', () => {
      onRequestCheckoutRecovery?.(itemsRef.current, { auto: true });
    });
    return unsubscribe;
  }, [navigation, onRequestCheckoutRecovery]);
  // «С этим берут»: к напиткам предлагаем десерты и еду, к остальному — напитки.
  // Товары, которые уже в корзине, не предлагаем.
  const inCartIds = new Set(items.map(item => item.id));
  const hasDrink = items.some(item => item.menuCategory === 'Напитки');
  const hasDessert = items.some(item => item.menuCategory === 'Десерты');
  const suggestionOrder = hasDrink ? (hasDessert ? ['Еда', 'Десерты'] : ['Десерты', 'Еда']) : ['Напитки'];
  const suggestions = suggestionOrder
    .flatMap(category => products.filter(p => p.menuCategory === category && !inCartIds.has(p.id)))
    .slice(0, 8);
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  const availableReward = getAvailableRewards(loyaltyState?.rewards || [])[0] || null;
  const rewardApplicable = availableReward ? isRewardApplicable(availableReward, cart) : false;
  const rewardEligibleItems = availableReward ? getEligibleCartItemsForReward(cart, availableReward) : [];
  const rewardApplied = rewardApplicable && appliedRewardId === availableReward?.id;
  const rewardDiscount = rewardApplied ? (rewardEligibleItems[0]?.baseUnitPrice ?? rewardEligibleItems[0]?.unitPrice ?? 0) : 0;
  const rewardKey = rewardApplied && rewardEligibleItems[0] ? cartKey(rewardEligibleItems[0].id, rewardEligibleItems[0].modifiers, rewardEligibleItems[0].preparationNote) : null;
  const promoSignature = JSON.stringify([account?.id, promo.trim().toUpperCase(), items, rewardKey, rewardDiscount]);
  promoSignatureRef.current = promoSignature;
  const promoValid = promoState === 'ok' && promoQuote?.signature === promoSignature;
  const discount = promoValid ? promoQuote.discount : 0;

  const serviceFee = subtotal > 0 ? 0 : 0;
  const total = Math.max(0, subtotal - discount - rewardDiscount + serviceFee);

  // total остаётся полной стоимостью товаров (совпадает с суммой order_items,
  // как и раньше) — списание бонусов не скидка, а отдельный способ оплаты
  // части total; сколько просить деньгами на кассе = total - bonusRedeemed.
  const maxBonusRedeemable = maxRedeemable(total, bonusAccount.balance);
  const bonusRedeemed = redeemBonuses ? maxBonusRedeemable : 0;
  const payTotal = money(total - bonusRedeemed);

  // Кэшбек начисляется бэкендом только с денежной части (см. миграцию) —
  // эта оценка только для UI, реальную сумму и уровень всегда считает триггер.
  const bonusRate = getBonusLevel(bonusAccount.lifetimePaid).rate;
  const earnedBonuses = Math.floor(payTotal * bonusRate);

  const applyPromo = async () => {
    if (promoState === 'loading' || ordering) return;
    const request = ++promoRequest.current, signature = promoSignature;
    setPromoState('loading'); setPromoQuote(null); setPromoError('');
    try {
      await getUserOrThrow();
      const result = await quotePromo(promo, items, rewardKey, rewardDiscount);
      if (!mountedRef.current || request !== promoRequest.current || signature !== promoSignatureRef.current) return;
      setPromoQuote({ ...result, signature }); setPromoState('ok');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      if (!mountedRef.current || request !== promoRequest.current || signature !== promoSignatureRef.current) return;
      setPromoError(promoMessage(error)); setPromoState('err');
    } finally {
      if (mountedRef.current && request === promoRequest.current && signature !== promoSignatureRef.current) setPromoState(null);
    }
  };

  const toggleReward = () => {
    if (!availableReward || !rewardApplicable) return;
    Haptics.selectionAsync();
    setAppliedRewardId(prev => (prev === availableReward.id ? null : availableReward.id));
  };

  // Оформление заказа теперь — один атомарный серверный вызов (Postgres RPC
  // create_order, см. supabase/migrations/20260911120000_atomic_order_creation.sql)
  // вместо двух последовательных insert с ручным rollback через DELETE.
  // Цену и total больше не считает и не отправляет клиент — сервер сам берёт
  // актуальную цену каждой позиции из products и сам считает subtotal/
  // discount/total. Клиент отправляет только product id + qty + промокод/
  // флаг награды/сумму списания бонусов — как предварительные намерения,
  // окончательное решение всегда за сервером. Локальный orderHistory (нужен
  // loyalty-программе и профилю) обновляется только ПОСЛЕ успешного ответа
  // сервера, чтобы локальное состояние никогда не расходилось с реальным
  // заказом.
  const runOrder = async () => {
    if (!account) { navigation.navigate('Login'); return; }
    const customer = await getUserOrThrow();
    const ownerChanged = () => !mountedRef.current || (!!getCurrentCustomerId && getCurrentCustomerId() !== customer.id);
    if (ownerChanged()) return;
    const contact = { ...validateContact({ name: customerName, phone: account?.phone || completePhoneInput(customerPhone) || '', comment: orderComment }), customer_id: customer.id };
    const fulfillment = { point_id: CAFE.pointId, pickup_at: null };
    const promoCode = promoValid ? promoQuote.code : null;
    const rewardRequested = rewardApplied;
    const bonusRedeem = redeemBonuses ? maxBonusRedeemable : 0;
    const expectedQuote = buildCheckoutQuote(items, payTotal);
    const attemptSignature = buildRequestFingerprint({ items, promoCode, rewardRequested, bonusRedeem, expectedQuote, contact, fulfillment });

    // НЕЛЬЗЯ молча затереть ЕЩЁ не разрешённую попытку (Block 1.3, п.1).
    // Источник истины здесь — то, что реально лежит в AsyncStorage (а не
    // in-memory checkoutAttemptRef, который мог не подхватиться при
    // определённых гонках) — если там лежит попытка ПОД ДРУГИМ (отличным
    // от текущего) fingerprint и она ещё не разрешена (SUBMITTING/UNKNOWN),
    // это значит: пользователь меняет корзину и пробует оформить НОВЫЙ,
    // независимый заказ поверх старой попытки, судьба которой неизвестна.
    // Старая попытка МОГЛА реально создать заказ на сервере — раньше
    // (Block 1.2) она бы просто была перезаписана здесь.
    const storedAttempt = await getPendingCheckoutAttempt();
    if (
      storedAttempt &&
      storedAttempt.fingerprint !== attemptSignature &&
      (storedAttempt.state === CHECKOUT_ATTEMPT_STATE.SUBMITTING || storedAttempt.state === CHECKOUT_ATTEMPT_STATE.UNKNOWN)
    ) {
      // Сначала пробуем авторитетно разрешить старую попытку READ-ONLY
      // lookup'ом (тот же recoverPendingCheckoutOnce, что и везде —
      // recovery не привязан к конкретному экрану, это один и тот же
      // централизованный механизм). Разрешённые исходы (FOUND_ACTIVE/
      // FOUND_TERMINAL/NOT_FOUND_FINAL/LOOKUP_FAILED_RETENTION_EXPIRED)
      // означают, что recovery сам очистил AsyncStorage — ниже можно
      // безопасно писать НОВУЮ попытку. Block 1.4, п.1 — важно: старая
      // попытка НЕ обязана быть старше 2 часов, чтобы это сработало —
      // если она старше uncertainty window (90 сек) и lookup уверенно
      // возвращает "нет заказа", это уже NOT_FOUND_FINAL, а не блокировка.
      const resolution = await onRequestCheckoutRecovery?.(items, { auto: false });
      const stillUnresolved =
        !resolution ||
        resolution.outcome === CHECKOUT_RECOVERY_OUTCOME.NOT_FOUND_UNCERTAIN ||
        resolution.outcome === CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED;

      if (stillUnresolved) {
        // Попытка младше uncertainty window (сервер теоретически ещё мог
        // обрабатывать исходный запрос) либо lookup прямо сейчас упал по
        // сети — по требованию "не терять unresolved checkout молча" мы НЕ
        // перезаписываем старую попытку и НЕ отправляем новый заказ.
        // Простой UX: явно сообщаем пользователю и просим повторить через
        // несколько секунд (за это время фоновый bounded-retry либо
        // foreground/focus-триггер, см. App.js, может успеть сам разрешить
        // старую попытку — а как только пройдёт uncertainty window, тот же
        // lookup станет NOT_FOUND_FINAL и разблокирует checkout сам).
        showMessage(
          'Не удалось подтвердить предыдущий заказ',
          'Проверьте подключение к интернету и повторите оформление через несколько секунд — сначала нужно выяснить судьбу предыдущей попытки.'
        );
        orderingRef.current = false;
        setOrdering(false);
        return;
      }

      // resolution.outcome — FOUND_ACTIVE/FOUND_TERMINAL/NOT_FOUND_FINAL/
      // LOOKUP_FAILED_RETENTION_EXPIRED: старая попытка уже разрешена и
      // удалена из AsyncStorage (см. recoverPendingCheckoutOnce), и (если
      // найден заказ) App.js уже применил результат (activeOrder/
      // уведомление). Сбрасываем локальный ref, чтобы ниже гарантированно
      // сгенерировался НОВЫЙ ключ для действительно нового заказа.
      checkoutAttemptRef.current = { key: null, signature: null };
    }

    // Состав попытки изменился с прошлого раза (пользователь поменял
    // корзину/промокод/награду/списание бонусов между попытками) — это уже
    // не retry прежней попытки, а новая, ей нужен новый ключ. Если старый
    // ключ всё же успел создать заказ на сервере, он останется как есть —
    // мы его просто больше не трогаем (сохранённая под старым ключом попытка
    // в AsyncStorage будет перезаписана новой ниже).
    if (checkoutAttemptRef.current.key && checkoutAttemptRef.current.signature !== attemptSignature) {
      checkoutAttemptRef.current = { key: null, signature: null };
    }
    const idempotencyKey = checkoutAttemptRef.current.key || generateIdempotencyKey();
    checkoutAttemptRef.current = { key: idempotencyKey, signature: attemptSignature };

    // Сохраняем попытку ДО сетевого запроса, со state=SUBMITTING — если
    // приложение будет убито между "сервер создал заказ" и "клиент получил
    // ответ", App.js при следующем запуске найдёт эту запись и сделает
    // READ-ONLY lookup (recoverPendingCheckoutOnce в lib/orderService.js);
    // сам заказ он не создаст — это только этот экран, в ответ на реальное
    // нажатие пользователя (см. комментарий в начале orderService.js).
    if (ownerChanged()) return;
    await savePendingCheckoutAttempt({
      idempotencyKey,
      items,
      promoCode,
      rewardRequested,
      bonusRedeem,
      expectedQuote,
      contact,
      fulfillment,
      customerId: customer.id,
      state: CHECKOUT_ATTEMPT_STATE.SUBMITTING,
    });

    try {
      // Аутентификация тихая и анонимная (ensureAnonymousSession в App.js,
      // signInAnonymously) — телефон нигде не запрашивается и не
      // подтверждается, никакого экрана входа перед этим нет. Вызываем здесь
      // же, чтобы при отсутствии сессии пользователь увидел понятную ошибку
      // раньше, чем RPC откажет с 'не удалось определить пользователя'.
      if (ownerChanged()) return;

      const order = await createOrder({
        idempotencyKey,
        items,
        promoCode,
        rewardRequested,
        bonusRedeem,
        expectedQuote,
        contact,
        fulfillment,
      });
      if (ownerChanged()) return;

      // reward_applied — решение СЕРВЕРА (он же выбрал, к какому именно
      // товару его применить), а не то, что до вызова считал клиент.
      void loyaltyState?.refresh?.();
      void bonusAccount.refresh();
      setAppliedRewardId(null);
      setRedeemBonuses(false);
      // Заказ успешно создан — эта попытка закрыта, следующий заказ (даже
      // с тем же составом корзины, если он ещё не очистился) получит новый
      // idempotency key.
      checkoutAttemptRef.current = { key: null, signature: null };
      // An accepted server order remains successful even if local cleanup fails.
      // Its persisted attempt can be recovered read-only after a restart.
      try { await clearPendingCheckoutAttempt(idempotencyKey); }
      catch (storageError) { console.warn('[order] accepted order cache cleanup failed', storageError); }

      const serverTotal = Number(order.total || 0);
      const serverBonusRedeemed = Number(order.bonus_redeemed || 0);

      onOrder({
        customerId: customer.id,
        pickupTime: formatPickupTime(order.pickup_at),
        pickupPoint: order.pickup_point || pickupPoint,
        pickupAt: order.pickup_at,
        // Итог берём из ответа сервера (authoritative), а не из локально
        // посчитанного payTotal — сервер мог применить/не применить
        // промокод или награду иначе, чем предполагал клиентский предпросмотр.
        total: serverTotal - serverBonusRedeemed,
        earnedBonuses, // клиентская ОЦЕНКА для UI; реальное начисление считает бэкенд-триггер при переходе в completed
        itemCount,
        supabaseOrderId: order.id,
        supabaseOrderNumber: order.order_number,
        serverStatus: order.status,
        createdAt: order.created_at,
        orderedItems: items,
      });
    } catch (error) {
      if (ownerChanged()) return;
      console.warn('[order] failed to create order via RPC', error);

      // Block 1.2, п.6: сервер отвечает либо ОКОНЧАТЕЛЬНО (деterministic —
      // валидация payload'а или IDEMPOTENCY_CONFLICT: сервер точно
      // обработал запрос и точно не создал заказ по этому ключу с этим
      // содержимым), либо неопределённо (сеть/таймаут/что угодно ещё —
      // неизвестно, дошёл ли запрос и что решил сервер).
      const classification = classifyOrderError(error);
      const isIdempotencyConflict = classification.code === 'IDEMPOTENCY_CONFLICT';

      if (classification.type === 'deterministic') {
        // Сервер ответил окончательно — этим ключом больше нечего
        // проверять при следующем запуске, попытка закрыта.
        checkoutAttemptRef.current = { key: null, signature: null };
        try { await clearPendingCheckoutAttempt(idempotencyKey); }
        catch (storageError) { console.warn('[order] rejected attempt cache cleanup failed', storageError); }
      } else {
        // Неизвестно, дошёл ли запрос до сервера — НЕ удаляем попытку,
        // помечаем её UNKNOWN, чтобы App.js мог позже (в т.ч. после
        // перезапуска) сделать read-only recovery-lookup. idempotencyKey
        // при этом не сбрасываем: повторное нажатие с тем же составом
        // корзины уйдёт с тем же ключом, и если сервер всё-таки успел
        // создать заказ, create_order() просто вернёт его вместо второго.
        try { await markPendingCheckoutAttemptState(idempotencyKey, CHECKOUT_ATTEMPT_STATE.UNKNOWN); }
        catch (storageError) { console.warn('[order] uncertain attempt cache update failed', storageError); }
        // Block 1.3, п.2/п.3: пока приложение остаётся открытым, есть смысл
        // в ограниченной (bounded, не polling) серии read-only проверок —
        // см. scheduleBoundedCheckoutRecoveryRetries в lib/orderService.js,
        // запускается из App.js.
        onCheckoutAttemptUncertain?.(idempotencyKey);
      }

      if (['PROMO_INVALID', 'PROMO_NOT_APPLICABLE'].includes(classification.code)) {
        setPromoState('err'); setPromoQuote(null); setPromoError(promoMessage(error));
        showMessage('Промокод не применён', promoMessage(error) + ' Заказ не создан.'); return;
      }
      if (classification.code === 'PRICE_CHANGED') { setPromoState(null); setPromoQuote(null); }
      if (['PRICE_CHANGED', 'PRODUCT_NOT_AVAILABLE', 'MODIFIER_NOT_AVAILABLE', 'MODIFIER_NOT_ALLOWED', 'REWARD_UNAVAILABLE', 'REWARD_ENTITLEMENT_REQUIRED', 'BONUS_BALANCE_CHANGED', 'BONUS_REDEEM_INVALID'].includes(classification.code)) {
        setAppliedRewardId(null);
        setRedeemBonuses(false);
        let refreshed = false;
        try {
          await onRefreshCheckout?.();
          await loyaltyState?.refresh?.();
          await bonusAccount.refresh();
          refreshed = true;
        } catch (refreshError) {
          console.warn('[checkout] price refresh failed', refreshError);
        }
        const unavailable = ['PRODUCT_NOT_AVAILABLE','MODIFIER_NOT_ALLOWED','MODIFIER_NOT_AVAILABLE'].includes(classification.code);
        const benefitsChanged = !['PRICE_CHANGED', 'PRODUCT_NOT_AVAILABLE','MODIFIER_NOT_ALLOWED','MODIFIER_NOT_AVAILABLE'].includes(classification.code);
        const message = benefitsChanged
          ? 'Подарок или доступные бонусы изменились. Проверьте итог и выберите их заново перед оформлением. Заказ не создан.'
          : unavailable
          ? (refreshed ? 'Доступность товаров или разрешённые добавки изменились. Затронутые позиции удалены из корзины. Проверьте состав и итог. Заказ не создан.' : 'Товары или выбранные добавки недоступны. Заказ не создан. Проверьте подключение и обновите корзину.')
          : refreshed
          ? 'Цены или скидки изменились. Корзина обновлена. Проверьте итог, при необходимости примените подарок и бонусы заново и нажмите «Оформить заказ» ещё раз. Заказ не создан.'
          : 'Цены или скидки изменились. Заказ не создан. Не удалось загрузить новые цены — проверьте подключение и повторите попытку.';
        showMessage(benefitsChanged ? 'Бонусы и награды обновились' : unavailable ? 'Товар недоступен' : 'Сумма заказа изменилась', message);
        return;
      }
      showMessage(
        'Не удалось оформить заказ',
        isIdempotencyConflict
          ? 'Похоже, состав заказа изменился во время оформления. Попробуйте оформить ещё раз.'
          : checkoutErrorMessage(classification.code)
      );
    } finally {
      orderingRef.current = false;
      if (mountedRef.current) setOrdering(false);
    }
  };

  const handleOrder = async () => {
    // Двойная защита от повторного тапа: synchronous ref (мгновенно, не
    // дожидаясь ре-рендера) + state (управляет disabled/loading кнопки).
    // Это только UX — реальная защита от дублей выше, на сервере.
    if (orderingRef.current || ordering) return;
    orderingRef.current = true;
    setOrdering(true);
    try {
      await runOrder();
    } catch (error) {
      // Сюда попадают сбои подготовки (AsyncStorage, recovery) до отправки
      // заказа: без этого блока флаг оставался бы true и кнопка «мёртвой».
      console.warn('[order] failed before submit', error);
      showMessage('Не удалось оформить заказ', error.message || 'Не удалось подготовить заказ. Проверьте подключение и повторите попытку.');
    } finally {
      orderingRef.current = false;
      if (mountedRef.current) setOrdering(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const recoveryNoticeBanner = checkoutRecoveryNotice ? (
    <View style={styles.recoveryNotice}>
      <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
      <Text style={styles.recoveryNoticeText}>{checkoutRecoveryNotice}</Text>
      {!!onDismissCheckoutRecoveryNotice && (
        <TouchableOpacity onPress={onDismissCheckoutRecoveryNotice} accessibilityRole="button" accessibilityLabel="Скрыть уведомление">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  // Гость корзиной и заказом не пользуется: сначала вход по номеру.
  if (!account) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScreenHeader title="Корзина" />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="person-outline"
            title="Войдите, чтобы заказывать"
            subtitle="Меню можно смотреть без входа. Чтобы добавить напиток в корзину и оформить заказ, войдите по номеру телефона."
            action={<PrimaryButton label="Войти по номеру" onPress={() => navigation.navigate('Login')} />}
          />
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScreenHeader title="Корзина" />
        {recoveryNoticeBanner}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="bag-handle-outline"
            title="Корзина пока пуста"
            subtitle="Добавьте напиток из меню — мы сохраним выбор и поможем быстро оформить заказ."
            action={<PrimaryButton label="Перейти в меню" onPress={() => navigation.navigate('MenuTab')} />}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Корзина" />
        {recoveryNoticeBanner}
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={item => item.key}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: spacing.md, paddingBottom: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={[styles.cartRow, shadow.card]}>
            <ProductImage
              source={item.image}
              category={item.category}
              aspectRatio={1}
              borderRadius={radius.medium - 4}
              contentFit="contain"
              contentPosition="center"
              zoom={0.88}
              style={{ width: 64, height: 64 }}
            />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
              {!!item.modifiers?.length && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs }}>{formatAdditions(item.modifiers)}</Text>}
              {!!item.preparationNote && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs }}>Пожелание: {item.preparationNote}</Text>}
              <Text style={styles.itemPrice}>{formatPrice(item.unitPrice)}</Text>
            </View>
            <QuantityStepper qty={item.qty} onIncrement={() => onIncrement(item)} onDecrement={() => onDecrement(item.key)} />
          </View>
        )}
        ListHeaderComponent={
          <View style={[styles.infoBox, shadow.card]}>
            <View style={styles.infoTop}>
              <View>
                <Text style={styles.infoTitle}>Ваш заказ</Text>
                <Text style={styles.infoSubtitle}>{itemCount} {itemCount === 1 ? 'позиция' : itemCount < 5 ? 'позиции' : 'позиций'} · начислим {earnedBonuses} бонусов</Text>
              </View>
              <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            </View>
          </View>
        }
        ListFooterComponent={
          <View>
            <View style={[styles.infoBox, { marginTop: spacing.md, gap: spacing.sm }]}>
              <Text style={styles.infoTitle}>Контакт для получения заказа</Text>
              <TextInput accessibilityLabel="Ваше имя" placeholder="Ваше имя" value={customerName} onChangeText={setCustomerName} maxLength={80} style={styles.contactInput} />
              <TextInput
                accessibilityLabel="Телефон для связи"
                placeholder={PHONE_INPUT_PLACEHOLDER}
                value={customerPhone}
                onChangeText={changeCustomerPhone}
                selection={phoneSelection}
                onSelectionChange={changePhoneSelection}
                editable={!account?.phone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                autoCorrect={false}
                style={styles.contactInput}
              />
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: commentExpanded }} accessibilityLabel="Комментарий к заказу" onPress={() => setCommentExpanded(value => !value)} style={styles.commentToggle}>
                <Text style={styles.commentToggleLabel}>{orderComment ? 'Комментарий добавлен' : 'Добавить комментарий к заказу'}</Text>
                <Ionicons name={commentExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              {commentExpanded && <TextInput accessibilityLabel="Текст комментария к заказу" placeholder="Например, как к вам обратиться при выдаче" value={orderComment} onChangeText={setOrderComment} maxLength={500} multiline style={styles.contactInput} />}
              {!account && <Text style={styles.pickupHintText}>Номер для связи. Для сохранения аккаунта между устройствами потребуется вход по SMS.</Text>}
            </View>
            {suggestions.length > 0 && onAddToCart && (
              <View style={styles.suggestBlock}>
                <Text style={styles.suggestTitle}>С этим берут</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -hPad }}
                  contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: spacing.md, gap: spacing.md }}
                >
                  {suggestions.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onPress={item => navigation.navigate('Product', { product: item })}
                      onAdd={onAddToCart}
                      qty={cart[cartKey(product.id)]?.qty || 0}
                      onIncrement={() => onAddToCart(product)}
                      onDecrement={() => onDecrement(cartKey(product.id))}
                      isFavorite={favoriteIds.includes(product.id)}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={[styles.summaryBox, shadow.card]}>
              <View style={styles.pickupInfoHeading}>
                <Text style={styles.infoTitle}>Самовывоз из SBL</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Показать кофейню на карте" onPress={() => navigation.navigate('CafeLocation')} style={styles.mapButton}>
                  <Ionicons name="map-outline" size={16} color={colors.accent} />
                  <Text style={styles.mapButtonText}>На карте</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pickupInfoRow}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.pickupInfoText}>{pickupPoint}</Text>
              </View>
              <View style={styles.pickupInfoRow}>
                <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.pickupInfoText}>{pickupTime} · ежедневно 11:00–20:00</Text>
              </View>
            </View>

            {availableReward && (
              <LoyaltyRewardCartCard
                reward={availableReward}
                applicable={rewardApplicable}
                eligibleItem={rewardEligibleItems[0]}
                applied={rewardApplied}
                onToggle={toggleReward}
              />
            )}

            <BonusRedeemCartCard
              maxRedeemable={maxBonusRedeemable}
              applied={redeemBonuses}
              onToggle={() => { Haptics.selectionAsync(); setRedeemBonuses(v => !v); }}
            />

            <View style={[styles.promoBox, promoState === 'ok' && { borderColor: colors.success }, promoState === 'err' && { borderColor: colors.danger }]}>
              <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
              <TextInput
                value={promo}
                onChangeText={text => { promoRequest.current++; setPromo(text); setPromoState(null); setPromoQuote(null); setPromoError(''); }}
                placeholder="Промокод"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={32}
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, fontSize: 13, color: colors.textPrimary }}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={applyPromo} disabled={promoState === 'loading' || ordering} accessibilityRole="button" accessibilityLabel="Применить промокод">
                <Text style={{ fontSize: 12, fontWeight: '700', color: promoValid ? colors.success : colors.accent }}>
                  {promoState === 'loading' ? 'Проверяем…' : promoValid ? '✓ −' + formatPrice(discount) : 'Применить'}
                </Text>
              </TouchableOpacity>
            </View>
            {promoState === 'ok' && !promoValid && <Text style={{fontSize:11,color:colors.textMuted,marginTop:6}}>Корзина изменилась. Примените промокод заново.</Text>}
            {promoState === 'err' && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}>{promoError}</Text>}

            <View style={[styles.summaryBox, shadow.card]}>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Сумма</Text><Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text></View>
              {discount > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Скидка</Text><Text style={[styles.summaryValue, { color: colors.success }]}>−{formatPrice(discount)}</Text></View>}
              {rewardDiscount > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Награда</Text><Text style={[styles.summaryValue, { color: colors.success }]}>−{formatPrice(rewardDiscount)}</Text></View>}
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Сервис</Text><Text style={styles.summaryValue}>{serviceFee === 0 ? 'Бесплатно' : formatPrice(serviceFee)}</Text></View>
              {bonusRedeemed > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Оплата бонусами</Text><Text style={[styles.summaryValue, { color: colors.success }]}>−{formatPrice(bonusRedeemed)}</Text></View>}
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Начислим бонусов</Text><Text style={[styles.summaryValue, { color: colors.accent }]}>+{earnedBonuses}</Text></View>
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>Итого к оплате</Text>
                <Text style={styles.totalValue}>{formatPrice(payTotal)}</Text>
              </View>
            </View>

            <View style={styles.pickupHint}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.pickupHintText}>Приём заказов до 19:55 по Томску. Оплата при получении.</Text>
            </View>
            {!cafeState.isOpen && <Text style={{ color: colors.danger, marginTop: spacing.sm }}>Сейчас заказы не принимаются. Кофейня открыта с 11:00 до 20:00 по Томску.</Text>}

          </View>
        }
      />
      <View style={[styles.checkoutDock, { paddingHorizontal: hPad, paddingBottom: tabBarHeight ? spacing.md : Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.checkoutDockSummary}>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkoutDockLabel}>К оплате при получении</Text>
            <Text style={styles.checkoutDockHint}>{cafeState.isOpen ? 'Готовим 3–5 минут' : 'Заказы: 11:00–19:55 · Томск'}</Text>
          </View>
          <Text style={styles.checkoutDockTotal} accessibilityLiveRegion="polite">{formatPrice(payTotal)}</Text>
        </View>
        <PrimaryButton fullWidth loading={ordering} disabled={!cafeState.isOpen} label={cafeState.isOpen ? 'Заказать · оплата при получении' : 'Приём заказов закрыт'} onPress={handleOrder} haptic="success" variant="holo" />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contactInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, padding: spacing.md, color: colors.textPrimary, backgroundColor: colors.surfaceElevated, fontSize: 14 },
  commentToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  commentToggleLabel: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  pickupInfoHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  pickupInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pickupInfoText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, flex: 1 },
  mapButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  mapButtonText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  checkoutDock: { backgroundColor: colors.surfaceElevated, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.level2 },
  checkoutDockSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  checkoutDockLabel: { fontSize: 13, color: colors.textSecondary },
  checkoutDockHint: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  checkoutDockTotal: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.textPrimary },
  recoveryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.medium,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  recoveryNoticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  suggestBlock: { marginTop: spacing.lg },
  suggestTitle: { fontSize: 19, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  infoBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  infoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  infoSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  cartRow: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: { fontSize: 15, lineHeight: 20, fontWeight: '400', color: colors.textPrimary },
  itemMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  itemPrice: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.accent, marginTop: 4 },
  sectionCaption: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.md },
  promoBox: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 52,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryBox: { backgroundColor: colors.surfaceElevated, borderRadius: radius.large, padding: spacing.lg, marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { fontSize: 13, color: colors.textSecondary },
  summaryValue: { fontSize: 13, color: colors.textPrimary },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.xs },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  totalValue: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.textPrimary },
  pickupHint: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  pickupHintText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
