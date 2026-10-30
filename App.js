import 'react-native-gesture-handler';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Linking, Easing, Dimensions, AppState, Alert, Platform } from 'react-native';
import Text, { FontReadyContext } from './components/AppText';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { fontAssets, fontFamilies } from './theme/fontFaces';

import HomeScreen from './screens/HomeScreen';
import MenuScreen from './screens/MenuScreen';
import ProductScreen from './screens/ProductScreen';
import CartScreen from './screens/CartScreen';
import OrderSuccessScreen from './screens/OrderSuccessScreen';
import ProfileScreen from './screens/ProfileScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import LoginScreen from './screens/LoginScreen';
import OrderHistoryScreen from './screens/OrderHistoryScreen';
import LoyaltyScreen from './screens/LoyaltyScreen';
import LoyaltyRewardModal from './components/loyalty/LoyaltyRewardModal';
import BrandLaunch from './components/BrandLaunch';
import CafeLocationScreen from './screens/CafeLocationScreen';
import useMotionPreference from './hooks/useMotionPreference';
import { parseProductLink } from './lib/productLinks';
import { HomeIcon, MenuIcon, CartIcon, ProfileIcon } from './navigation/TabIcons';
import { colors } from './theme/tokens';
import { cartKey, getProductById } from './data/products';
import { getAvailableRewards } from './loyalty/loyaltyService';
import { fetchOrderingCatalog } from './lib/catalogService';
import { selectMenuProducts, hasProductPhoto } from './lib/menuVisibility';
import { makeCartItem, cartMatchesSnapshot } from './lib/cartOptions';
import { getVerifiedAccount, signOutAccount } from './lib/accountService';
import useOrderNotifications from './hooks/useOrderNotifications';
import { refreshCartPrices } from './lib/checkoutQuote';
import useLoyaltyState from './loyalty/useLoyaltyState';
import useCustomerOrders from './hooks/useCustomerOrders';
import useBonusAccount from './hooks/useBonusAccount';
import { buildTodaySyntheticOrder, buildSyntheticStreakOrders } from './loyalty/loyaltyDev';
import { getUserOrThrow, supabase } from './lib/supabaseClient';
import {
  recoverPendingCheckoutOnce,
  scheduleBoundedCheckoutRecoveryRetries,
  ORDER_FINAL_STATUSES,
  CHECKOUT_RECOVERY_OUTCOME,
  clearPendingCheckoutAttempt,
} from './lib/orderService';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => {});

const TAB_BAR_HEIGHT = 64;
const SCREEN_WIDTH = Dimensions.get('window').width;

// Полноценный горизонтальный "перелист" между табами: текущий экран уезжает
// в одну сторону, следующий въезжает с другой — вместо едва заметного shift.
const pageSlideInterpolator = ({ current }) => ({
  sceneStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        }),
      },
    ],
  },
});
const STORAGE_KEYS = {
  cart: 'sbl_cart',
  favorites: 'sbl_favorites',
  account: 'sbl_account', // тестовый вход по телефону, см. screens/LoginScreen.js
  orders: 'sbl_orders',
  activeOrder: 'sbl_active_order',
};

function TabBarIcon({ route, focused, cartCount }) {
  switch (route.name) {
    case 'HomeTab': return <HomeIcon focused={focused} />;
    case 'MenuTab': return <MenuIcon focused={focused} />;
    case 'CartTab': return <CartIcon focused={focused} count={cartCount} />;
    case 'ProfileTab': return <ProfileIcon focused={focused} />;
    default: return null;
  }
}

function Tabs({
  account,
  getCurrentCustomerId,
  onLogout,
  cart,
  favorites,
  orderHistory,
  products,
  catalogLoading,
  catalogError,
  onRetryCatalog,
  onAddToCart,
  onIncrement,
  onDecrement,
  onRefreshCheckout,
  onOrder,
  onToggleFavorite,
  onRepeatOrder,
  loyaltyState,
  onRedeemReward,
  activeOrder,
  onOpenActiveOrder,
  onActiveOrderFinished,
  checkoutRecoveryNotice,
  onDismissCheckoutRecoveryNotice,
  onRequestCheckoutRecovery,
  onCheckoutAttemptUncertain,
}) {
  const insets = useSafeAreaInsets();
  const fontsReady = useContext(FontReadyContext);
  const { reduceMotion } = useMotionPreference();
  const cartCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyleInterpolator: reduceMotion ? undefined : pageSlideInterpolator,
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: reduceMotion ? 0 : 280,
            easing: Easing.out(Easing.cubic),
          },
        },
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.accent,
        // Было слишком светлое (#B0AEA8) — на белом фоне неактивные иконки/
        // подписи почти не читались. Взяли более контрастный нейтральный серый.
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 4),
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.045,
          shadowRadius: 18,
          elevation: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fontsReady ? fontFamilies[600] : undefined,
          fontSize: 12,
          fontWeight: fontsReady ? 'normal' : '600',
          lineHeight: 16,
          flexShrink: 0,
        },
        tabBarIcon: ({ focused }) => <TabBarIcon route={route} focused={focused} cartCount={cartCount} />,
      })}
      screenListeners={({ navigation }) => ({
        tabPress: () => {
          if (!navigation.isFocused() && !reduceMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        },
      })}
    >
      <Tab.Screen name="HomeTab" options={{ tabBarLabel: 'Главная', title: 'Главная' }}>
        {props => (
          <HomeScreen
            {...props}
            cart={cart}
            products={products}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            onRetryCatalog={onRetryCatalog}
            onAddToCart={onAddToCart}
            onDecrement={onDecrement}
            onRefreshCheckout={onRefreshCheckout}
            onRepeatOrder={onRepeatOrder}
            onToggleFavorite={onToggleFavorite}
            favoriteIds={favorites}
            orderHistory={orderHistory}
            tabBarHeight={tabBarHeight}
            loyaltyState={loyaltyState}
            activeOrder={activeOrder}
            onOpenActiveOrder={onOpenActiveOrder}
            onActiveOrderFinished={onActiveOrderFinished}
          />
        )}
      </Tab.Screen>

      <Tab.Screen name="MenuTab" options={{ tabBarLabel: 'Меню', title: 'Меню' }}>
        {props => (
          <MenuScreen
            {...props}
            cart={cart}
            products={products}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            onRetryCatalog={onRetryCatalog}
            onAddToCart={onAddToCart}
            onDecrement={onDecrement}
            onRefreshCheckout={onRefreshCheckout}
            onToggleFavorite={onToggleFavorite}
            favoriteIds={favorites}
            tabBarHeight={tabBarHeight}
          />
        )}
      </Tab.Screen>

      <Tab.Screen name="CartTab" options={{ tabBarLabel: 'Корзина', title: 'Корзина' }}>
        {props => (
          <CartScreen
            key={getCurrentCustomerId?.() || 'guest'}
            {...props}
            cart={cart}
            account={account}
            getCurrentCustomerId={getCurrentCustomerId}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onRefreshCheckout={onRefreshCheckout}
            onOrder={onOrder}
            tabBarHeight={tabBarHeight}
            products={products}
            onAddToCart={onAddToCart}
            favoriteIds={favorites}
            onToggleFavorite={onToggleFavorite}
            loyaltyState={loyaltyState}
            onRedeemReward={onRedeemReward}
            checkoutRecoveryNotice={checkoutRecoveryNotice}
            onDismissCheckoutRecoveryNotice={onDismissCheckoutRecoveryNotice}
            onRequestCheckoutRecovery={onRequestCheckoutRecovery}
            onCheckoutAttemptUncertain={onCheckoutAttemptUncertain}
          />
        )}
      </Tab.Screen>

      <Tab.Screen name="ProfileTab" options={{ tabBarLabel: 'Профиль', title: 'Профиль' }}>
        {props => (
          <ProfileScreen
            {...props}
            tabBarHeight={tabBarHeight}
            favoriteIds={favorites}
            orderHistory={orderHistory}
            onRepeatOrder={onRepeatOrder}
            loyaltyState={loyaltyState}
            account={account}
            onLogout={onLogout}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function RootStack({
  account,
  getCurrentCustomerId,
  onLogin,
  onLogout,
  cart,
  favorites,
  orderHistory,
  products,
  modifiers,
  catalogLoading,
  catalogError,
  onRetryCatalog,
  onAddToCart,
  onIncrement,
  onDecrement,
  onRefreshCheckout,
  onOrder,
  onToggleFavorite,
  onRepeatOrder,
  loyaltyState,
  onRedeemReward,
  devSimulateToday,
  devSimulateTenDayStreak,
  devResetLoyalty,
  activeOrder,
  onOpenActiveOrder,
  onActiveOrderFinished,
  checkoutRecoveryNotice,
  onDismissCheckoutRecoveryNotice,
  onRequestCheckoutRecovery,
  onCheckoutAttemptUncertain,
}) {
  const { reduceMotion } = useMotionPreference();
  // Keep the complete ordering catalog in App for cart refresh/history/additions.
  // Only customer discovery and product choices use the photo-only projection.
  const menuProducts = useMemo(() => selectMenuProducts(products), [products]);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default' }}>
      <Stack.Screen name="Tabs">
        {props => (
          <Tabs
            {...props}
            account={account}
            getCurrentCustomerId={getCurrentCustomerId}
            onLogout={onLogout}
            cart={cart}
            favorites={favorites}
            orderHistory={orderHistory}
            products={menuProducts}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            onRetryCatalog={onRetryCatalog}
            onAddToCart={onAddToCart}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onRefreshCheckout={onRefreshCheckout}
            onOrder={onOrder}
            onToggleFavorite={onToggleFavorite}
            onRepeatOrder={onRepeatOrder}
            loyaltyState={loyaltyState}
            onRedeemReward={onRedeemReward}
            activeOrder={activeOrder}
            onOpenActiveOrder={onOpenActiveOrder}
            onActiveOrderFinished={onActiveOrderFinished}
            checkoutRecoveryNotice={checkoutRecoveryNotice}
            onDismissCheckoutRecoveryNotice={onDismissCheckoutRecoveryNotice}
            onRequestCheckoutRecovery={onRequestCheckoutRecovery}
            onCheckoutAttemptUncertain={onCheckoutAttemptUncertain}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Product"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
          gestureEnabled: false,
        }}
      >
        {props => (
          <ProductScreen
            key={props.route.params.product.id}
            {...props}
            cart={cart}
            products={menuProducts}
            modifiers={modifiers}
            onAddToCart={onAddToCart}
            onDecrement={onDecrement}
            onRefreshCheckout={onRefreshCheckout}
            onToggleFavorite={onToggleFavorite}
            favoriteIds={favorites}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="CafeLocation" component={CafeLocationScreen} />

      <Stack.Screen name="OrderHistory">
        {props => (
          <OrderHistoryScreen
            {...props}
            orderHistory={orderHistory}
            products={products}
            onRepeatOrder={onRepeatOrder}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="Favorites">
        {props => (
          <FavoritesScreen
            {...props}
            favoriteIds={favorites}
            products={menuProducts}
            cart={cart}
            onAddToCart={onAddToCart}
            onDecrement={onDecrement}
            onRefreshCheckout={onRefreshCheckout}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Login"
        options={{ presentation: 'modal', animation: reduceMotion ? 'none' : 'slide_from_bottom', gestureEnabled: true }}
      >
        {props => <LoginScreen {...props} onLogin={onLogin} />}
      </Stack.Screen>

      <Stack.Screen
        name="Loyalty"
        options={{ presentation: 'card', animation: reduceMotion ? 'none' : 'slide_from_right', gestureEnabled: true }}
      >
        {props => (
          <LoyaltyScreen
            {...props}
            loyaltyState={loyaltyState}
            devSimulateToday={devSimulateToday}
            devSimulateTenDayStreak={devSimulateTenDayStreak}
            devResetLoyalty={devResetLoyalty}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [isReady, setIsReady] = useState(false);
  const [launchDone, setLaunchDone] = useState(false);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const navigationRef = useRef(null);
  const [pendingProductId, setPendingProductId] = useState(null);
  const [linkNotice, setLinkNotice] = useState(null);
  const [cart, setCart] = useState({});
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [account, setAccount] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [orderComplete, setOrderComplete] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [authUserId, setAuthUserId] = useState(null);
  const [notificationOrder, setNotificationOrder] = useState(null);
  const authUserRef = useRef(undefined);
  const authRevision = useRef(0);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const catalogRevision = useRef(0);
  const catalogRefresh = useRef(() => {});
  const customerOrders = useCustomerOrders(isReady);
  const bonusAccount = useBonusAccount();
  useEffect(() => {
    if (!isReady || !customerOrders.loaded || customerOrders.error) return;
    setOrderHistory(customerOrders.data);
    const active = customerOrders.data.find(order => !ORDER_FINAL_STATUSES.includes(order.status));
    setActiveOrder(active ? {
      id: active.id, orderNumber: active.orderNumber.replace(/^№/, ''), status: active.status,
    } : null);
  }, [isReady, customerOrders.data, customerOrders.loaded, customerOrders.error]);
  // Block 1.4: заполняется, только если recovery авторитетно выяснил, что
  // предыдущая попытка НЕ привела к заказу — либо uncertainty window истёк
  // и lookup уверенно не нашёл заказ (NOT_FOUND_FINAL), либо retention TTL
  // истёк, пока сеть была недоступна (LOOKUP_FAILED_RETENTION_EXPIRED). НЕ
  // на каждый "пока не знаем" (см. applyCheckoutRecoveryResult ниже).
  const [checkoutRecoveryNotice, setCheckoutRecoveryNotice] = useState(null);
  const loyalty = useLoyaltyState(orderHistory);
  // applyCheckoutRecoveryResult вызывается из таймеров/слушателей, созданных
  // на прошлых рендерах, — им нужны актуальные награды и каталог, а не
  // замкнутые в старом рендере.
  const loyaltyRef = useRef(loyalty);
  loyaltyRef.current = loyalty;
  const productsRef = useRef(products);
  productsRef.current = products;

  // Block 1.3, п.2: recovery теперь запускается из нескольких мест (старт,
  // AppState foreground, фокус экрана корзины, bounded-retry таймеры) — все
  // они должны видеть АКТУАЛЬНУЮ корзину, а не ту, что была на момент
  // подписки эффекта/колбэка. cartRef всегда синхронизирован с cart.
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Отменяет ещё не сработавшие таймеры bounded-retry recovery (Block 1.3,
  // п.3) — на случай размонтирования (в реальности App живёт всё время
  // работы приложения, но это защищает от утечки таймеров при hot reload
  // в разработке и просто хорошая гигиена).
  const uncertaintyRetryCancelersRef = useRef([]);
  useEffect(() => () => {
    uncertaintyRetryCancelersRef.current.forEach(cancel => cancel());
    uncertaintyRetryCancelersRef.current = [];
  }, []);

  // Единая интерпретация результата recoverPendingCheckoutOnce — ВСЕГДА
  // выполняется здесь, независимо от того, какой триггер вызвал recovery
  // (старт, foreground, фокус корзины, bounded-retry, conflict-check перед
  // новым заказом). CartScreen (см. onRequestCheckoutRecovery,
  // onCheckoutAttemptUncertain) только СИГНАЛИЗИРУЕТ о событиях, при
  // которых стоит проверить recovery — сам lookup, его интерпретация и все
  // побочные эффекты (setActiveOrder/setCart/уведомление) остаются
  // централизованными здесь, в единственном controller'е (Block 1.4, п.3).
  // Заказ создался на сервере, но ответ потерялся и нашёлся через recovery:
  // обычный путь (CartScreen -> onRedeemReward + placeOrder) не отработал, и
  // без этого награда осталась бы доступной повторно, а день не попал бы в
  // серию. Делаем то же, что и при нормальном оформлении: гасим награду, если
  // сервер её применил, и заносим заказ в локальную историю (из неё loyalty
  // считает посещения). Повторный вызов безопасен: история дедуплицируется
  // по id заказа, а погашенная награда больше не 'available'.
  const applyRecoveredOrder = (result) => {
    const order = result?.order;
    if (!order?.id) return;

    if (order.reward_applied) {
      const reward = getAvailableRewards(loyaltyRef.current?.rewards || [])[0];
      if (reward) loyaltyRef.current.redeemReward(reward.id);
    }

    const items = (result.attemptItems || []).map(item => ({
      key: cartKey(item.id, item.modifiers, item.preparationNote),
      id: item.id,
      qty: item.qty,
      modifiers: item.modifiers || [],
      preparationNote: item.preparationNote || '',
      unitPrice: getProductById(productsRef.current, item.id)?.price ?? 0,
    }));
    const orderRecord = {
      id: order.id,
      supabaseOrderId: order.id,
      orderNumber: order.order_number ? `№${order.order_number}` : 'Заказ',
      createdAt: order.created_at || new Date().toISOString(),
      total: Number(order.total || 0) - Number(order.bonus_redeemed || 0),
      itemCount: items.reduce((sum, item) => sum + item.qty, 0),
      items,
    };
    setOrderHistory(prev => (
      prev.some(existing => existing.id === orderRecord.id) ? prev : [orderRecord, ...prev].slice(0, 12)
    ));
  };

  const applyCheckoutRecoveryResult = (result) => {
    switch (result?.outcome) {
      case CHECKOUT_RECOVERY_OUTCOME.FOUND_ACTIVE: {
        applyRecoveredOrder(result);
        setActiveOrder({ id: result.order.id, orderNumber: result.order.order_number, status: result.order.status });
        // Корзину чистим, только если она не изменилась с момента исходной
        // попытки — иначе есть риск стереть то, что пользователь добавил
        // уже после сбоя и никак не связанное с восстановленным заказом.
        if (result.matchesCurrentCart) setCart(previous => cartMatchesSnapshot(previous, result.attemptItems) ? {} : previous);
        break;
      }
      case CHECKOUT_RECOVERY_OUTCOME.FOUND_TERMINAL: {
        applyRecoveredOrder(result);
        // Заказ найден, но уже в финальном статусе (completed/cancelled) —
        // баннер "новый"/"готовится" не имеет смысла, activeOrder не
        // поднимаем. Попытка при этом всё равно разрешена (уже удалена из
        // AsyncStorage — см. recoverPendingCheckoutOnce). Cart cleanup — та
        // же логика, что и для активного заказа: сами товары были списаны
        // в заказ независимо от его текущего статуса.
        if (result.matchesCurrentCart) setCart(previous => cartMatchesSnapshot(previous, result.attemptItems) ? {} : previous);
        break;
      }
      case CHECKOUT_RECOVERY_OUTCOME.NOT_FOUND_FINAL: {
        // Block 1.4, п.1: uncertainty window истёк, lookup уверенно не
        // нашёл заказ — считаем исходную попытку несостоявшейся
        // ОКОНЧАТЕЛЬНО. Попытка уже удалена (recoverPendingCheckoutOnce),
        // новый checkout доступен сразу же — НЕ через 2 часа. Уведомление
        // чисто информационное.
        setCheckoutRecoveryNotice('Предыдущий заказ не удалось подтвердить. Вы можете оформить заказ ещё раз.');
        break;
      }
      case CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED_RETENTION_EXPIRED: {
        // Block 1.4, п.2: сеть была недоступна дольше retention TTL — не
        // утверждаем, что заказа точно нет (мы так и не смогли спросить
        // сервер), но локально прекращаем отслеживать эту попытку — иначе
        // держали бы её вечно. Новый checkout не блокируем.
        setCheckoutRecoveryNotice('Не удалось подтвердить статус предыдущего заказа. Вы можете оформить заказ ещё раз.');
        break;
      }
      case CHECKOUT_RECOVERY_OUTCOME.NOT_FOUND_UNCERTAIN:
      case CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED:
      case CHECKOUT_RECOVERY_OUTCOME.THROTTLED:
      case CHECKOUT_RECOVERY_OUTCOME.NONE:
      default:
        // NOT_FOUND_UNCERTAIN (моложе uncertainty window — рано считать
        // окончательным), LOOKUP_FAILED (сеть, retention ещё не истёк) и
        // THROTTLED (см. RECOVERY_AUTO_CHECK_COOLDOWN_MS) — все они
        // оставляют попытку как есть, без уведомления: возможно, запрос
        // ещё обрабатывается или сеть скоро вернётся, следующий триггер
        // (foreground/фокус/bounded-retry/явное действие) проверит снова.
        break;
    }
  };

  // Единая точка запуска recovery — используется стартовым эффектом,
  // AppState-слушателем и (через пропс onRequestCheckoutRecovery)
  // CartScreen.js. Сам recoverPendingCheckoutOnce всегда read-only,
  // single-flight и idempotent (см. lib/orderService.js) — эта обёртка
  // только применяет результат централизованно и не даёт ошибке вылететь
  // необработанной.
  const runCheckoutRecovery = async (cartItems, options) => {
    const ownerRevision = authRevision.current;
    try {
      const result = await recoverPendingCheckoutOnce(cartItems, options);
      if (ownerRevision === authRevision.current) applyCheckoutRecoveryResult(result);
      return result;
    } catch (error) {
      console.warn('[order] checkout recovery failed', error);
      return { outcome: CHECKOUT_RECOVERY_OUTCOME.LOOKUP_FAILED, error };
    }
  };

  // Сигнал от CartScreen о том, что попытка только что перешла в UNKNOWN
  // (сетевая ошибка/таймаут при create_order). Пока приложение остаётся
  // открытым, есть смысл сделать ограниченную (не polling!) серию
  // read-only проверок с bounded backoff — см.
  // CHECKOUT_RECOVERY_BOUNDED_RETRY_DELAYS_MS в lib/orderService.js.
  const handleCheckoutAttemptUncertain = (idempotencyKey) => {
    const ownerRevision = authRevision.current;
    const cancel = scheduleBoundedCheckoutRecoveryRetries({
      idempotencyKey,
      getCartItems: () => Object.values(cartRef.current || {}),
      onResult: result => { if (ownerRevision === authRevision.current) applyCheckoutRecoveryResult(result); },
    });
    uncertaintyRetryCancelersRef.current.push(cancel);
  };

  const productsById = useMemo(() => {
    const map = {};
    products.forEach(product => { map[product.id] = product; });
    return map;
  }, [products]);

  // Меню грузим из Supabase (таблица products, синхронизируется из СБИС
  // отдельной Edge Function — см. lib/catalogService.js и файлы в "Claude
  // outputs"). Пока список не пришёл, экраны получают пустой массив — это
  // сознательно (см. HomeScreen/MenuScreen), а не считается ошибкой.
  useEffect(() => {
    let active = true;
    const refreshCatalog = async () => {
      const request = ++catalogRevision.current;
      if (active) setCatalogLoading(true);
      try {
        const rows = await fetchOrderingCatalog();
        if (active && request === catalogRevision.current) { setProducts(rows.filter(p => !p.isModifier)); setModifiers(rows.filter(p => p.isModifier)); setCatalogError(null); }
      } catch (error) {
        if (active && request === catalogRevision.current) setCatalogError(error);
      } finally {
        if (active && request === catalogRevision.current) setCatalogLoading(false);
      }
    };
    catalogRefresh.current = refreshCatalog;
    refreshCatalog();
    const timer = setInterval(refreshCatalog, 30000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') refreshCatalog();
    });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, []);

  // Deep links identify a public SKU only; never accept Auth tokens or external routes.
  useEffect(() => {
    let active = true;
    const receive = value => {
      const id = parseProductLink(typeof value === 'string' ? value : value?.url, { webOrigin: Platform.OS === 'web' ? window.location.href : null });
      if (active && id) { setLinkNotice(null); setPendingProductId(id); }
    };
    void Linking.getInitialURL().then(receive).catch(() => {});
    const subscription = Linking.addEventListener('url', receive);
    const onHash = () => receive(window.location.href);
    if (Platform.OS === 'web') window.addEventListener('hashchange', onHash);
    return () => { active = false; subscription.remove(); if (Platform.OS === 'web') window.removeEventListener('hashchange', onHash); };
  }, []);

  useEffect(() => {
    if (!isReady || !pendingProductId || catalogLoading || orderComplete || !navigationRef.current?.isReady()) return;
    const product = products.find(item => item.id === pendingProductId && hasProductPhoto(item));
    if (product) { navigationRef.current.navigate('Product', { product }); setPendingProductId(null); }
    else if (!catalogError) { setPendingProductId(null); setLinkNotice('Эта позиция сейчас недоступна. Посмотрите другие напитки в меню.'); }
  }, [isReady, pendingProductId, catalogLoading, products, catalogError, orderComplete, navigationVersion]);

  // Тихий анонимный вход в Supabase, затем сверяем с сервером, есть ли у
  // пользователя незавершённый заказ — баннер на Главной должен появляться
  // даже после полного перезапуска приложения, а не только пока App.js жив
  // в памяти. Кэш в AsyncStorage (ниже) используется только для мгновенной
  // отрисовки до ответа сервера — источник истины всегда Supabase.
  // Server reads start only after cache hydration in useCustomerOrders.

  // Тестовый вход по телефону (screens/LoginScreen.js): аккаунт только локальный.
  // Выход не трогает корзину, избранное и историю — они привязаны к устройству,
  // а не к аккаунту; Supabase-сессия покупателя анонимная и остаётся прежней.
  const handleLogin = (nextAccount) => {
    if (!nextAccount?.id || nextAccount.id !== authUserRef.current) return;
    setAccount(nextAccount);
  };

  const handleLogout = async () => {
    try { await signOutAccount(); }
    catch (error) {
      if (Platform.OS === 'web') globalThis.alert(error.message || 'Не удалось выйти. Проверьте подключение.');
      else Alert.alert('Не удалось выйти', error.message || 'Проверьте подключение.');
      throw error;
    }
  };

  useEffect(() => {
    if (!isReady) return;
    let active = true;
    let revision = 0;
    const applySession = session => {
      if (!active) return;
      const nextId = session?.user?.id || null;
      if (authUserRef.current !== undefined && authUserRef.current !== nextId) {
        authRevision.current += 1;
        uncertaintyRetryCancelersRef.current.forEach(cancel => cancel());
        uncertaintyRetryCancelersRef.current = [];
        setOrderHistory([]); setActiveOrder(null); setOrderComplete(null); setCheckoutRecoveryNotice(null);
        setNotificationOrder(null);
        void clearPendingCheckoutAttempt().catch(() => {});
        void AsyncStorage.multiRemove([STORAGE_KEYS.orders, STORAGE_KEYS.activeOrder, STORAGE_KEYS.account]).catch(() => {});
      }
      authUserRef.current = nextId;
      setAuthUserId(nextId);
      setAccount(getVerifiedAccount(session));
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { revision += 1; applySession(session); });
    const initialRevision = revision;
    supabase.auth.getSession().then(({ data, error }) => { if (error) throw error; if (initialRevision === revision) applySession(data?.session); }).catch(() => { console.warn('[auth] session restore unavailable'); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [isReady]);

  useOrderNotifications({ userId: authUserId, onOpenOrder: orderId => {
    if (orderId && authUserRef.current) { setNotificationOrder({ id: orderId, userId: authUserRef.current }); void customerOrders.refresh(); }
  } });
  useEffect(() => {
    if (!notificationOrder || !customerOrders.loaded || customerOrders.error || customerOrders.customerId !== notificationOrder.userId) return;
    const ownedOrder = customerOrders.data.find(order => order.id === notificationOrder.id);
    if (ownedOrder && authUserRef.current === notificationOrder.userId) setOrderComplete({ supabaseOrderId: ownedOrder.id, orderNumber: ownedOrder.orderNumber, status: ownedOrder.status });
    setNotificationOrder(null);
  }, [notificationOrder, customerOrders.loaded, customerOrders.data, customerOrders.error, customerOrders.customerId]);

  useEffect(() => {
    AsyncStorage.multiGet([
      STORAGE_KEYS.cart,
      STORAGE_KEYS.favorites,
      STORAGE_KEYS.orders,
      STORAGE_KEYS.activeOrder,
      STORAGE_KEYS.account,
    ]).then(entries => {
      const map = Object.fromEntries(entries);

      // Каждый ключ разбираем отдельно: одна битая JSON-строка не должна
      // ломать восстановление остальных данных.
      const restore = (key, apply) => {
        try {
          if (map[key]) apply(JSON.parse(map[key]));
        } catch (error) {
          console.warn('Failed to restore local state:', key, error);
        }
      };
      restore(STORAGE_KEYS.cart, setCart);
      restore(STORAGE_KEYS.favorites, setFavoriteIds);
      // Account, orders and active order are restored from the authenticated
      // server session, never from a previous user's device-only phone stub.
      // Кэш для мгновенной отрисовки баннера — refreshActiveOrder() выше
      // сверит это с сервером сразу после старта и перезапишет при расхождении.
      setIsReady(true);
    }).catch(error => {
      // Хранилище недоступно: лучше открыть приложение с пустым состоянием,
      // чем навсегда оставить экран «Подготавливаем кофейню».
      console.warn('Failed to read local storage', error);
      setIsReady(true);
    });
  }, []);

  // Recovery незавершённого checkout после (пере)запуска приложения — один
  // из нескольких bounded-триггеров (Block 1.3, п.2; см. также AppState-
  // эффект ниже и фокус-эффект в CartScreen.js). Централизованная
  // интерпретация результата (applyCheckoutRecoveryResult выше) остаётся
  // единой независимо от того, что именно инициировало проверку.
  //
  // КРИТИЧНО отличается от Block 1.1: здесь НЕ вызывается create_order().
  // Наличие незавершённой попытки означает лишь "клиент не знает исход
  // предыдущего запроса" — это НЕ согласие пользователя оформить заказ
  // сейчас. recoverPendingCheckoutOnce() делает только READ-ONLY lookup
  // (get_order_by_idempotency_key); если сервер уже создал заказ, мы о нём
  // узнаём и показываем, если нет — ничего не создаём автоматически,
  // пользователь должен сам нажать "Оформить заказ" ещё раз.
  useEffect(() => {
    if (!isReady) return;
    (async () => {
      try {
        await getUserOrThrow();
        await runCheckoutRecovery(Object.values(cart), { auto: true });
      } catch (error) {
        console.warn('[order] checkout recovery failed on startup', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // "app foreground" bounded recovery trigger: пользователь мог свернуть
  // приложение прямо во время сомнительного checkout (сеть пропала/на
  // грани) и вернуться спустя время — при РЕАЛЬНОМ возврате на передний
  // план имеет смысл (но не в цикле — { auto: true } применяет cooldown,
  // см. RECOVERY_AUTO_CHECK_COOLDOWN_MS) проверить, не разрешилась ли
  // ситуация без перезапуска всего приложения.
  //
  // Block 1.4, п.6: срабатывает ТОЛЬКО на настоящий переход
  // background/inactive -> active, а не на любое 'change'-событие (и не на
  // начальную подписку — AppState.addEventListener не вызывает колбэк для
  // текущего состояния в момент подписки). appStateRef хранит предыдущее
  // значение, чтобы отличить реальный переход от повторного 'active' или
  // прочих транзиций (active -> inactive и т.п.), которые нас не касаются.
  //
  // NetInfo (реальный "network reconnect" триггер) в проекте пока не
  // используется и не добавляется этим блоком, чтобы не расширять scope
  // новой зависимостью — но это единственная точка, к которой стоит
  // подключить его listener в будущем (тот же runCheckoutRecovery с
  // { auto: true }).
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      const cameToForeground = (prevState === 'background' || prevState === 'inactive') && nextState === 'active';
      if (!cameToForeground) return;

      getUserOrThrow()
        .then(() => runCheckoutRecovery(Object.values(cartRef.current || {}), { auto: true }))
        .catch(error => console.warn('[order] checkout recovery on foreground failed', error));
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
  }, [cart, isReady]);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favoriteIds));
  }, [favoriteIds, isReady]);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orderHistory));
  }, [orderHistory, isReady]);

  useEffect(() => {
    if (!isReady) return;
    if (activeOrder?.id) {
      AsyncStorage.setItem(STORAGE_KEYS.activeOrder, JSON.stringify(activeOrder));
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.activeOrder);
    }
  }, [activeOrder, isReady]);

  // В реальном меню СБИС у каждого варианта товара (размер, молоко и т.д.)
  // уже отдельная позиция со своей ценой — поэтому один товар = одна строка
  // корзины, без выбора опций поверх цены (раньше это делали sizeId/milkId/
  // temperatureId/addonIds, теперь не нужны).
  const addToCart = (product, selectedModifiers = [], preparationNote = '', quantity = 1) => {
    product = products.find(current => current.id === product?.id && current.isAvailable !== false);
    const currentModifiers = selectedModifiers.map(m => {
      const current = modifiers.find(candidate => candidate.id === (m.id || m.product_id));
      return current && current.isAvailable !== false ? { id: current.id, name: current.displayName || current.name, quantity: m.quantity, unitPrice: current.price } : null;
    });
    if (currentModifiers.some(m => !m)) return false;
    const item = makeCartItem(product, currentModifiers, quantity, preparationNote);
    if (!item) return false;
    setCart(prev => ({ ...prev, [item.key]: { ...item, qty: Math.min(99, (prev[item.key]?.qty || 0) + quantity) } }));
    return true;
  };

  const refreshCheckoutPrices = async () => {
    const request = ++catalogRevision.current;
    setCatalogLoading(true);
    try {
      const latestProducts = await fetchOrderingCatalog();
      if (request === catalogRevision.current) { setProducts(latestProducts.filter(p => !p.isModifier)); setModifiers(latestProducts.filter(p => p.isModifier)); setCatalogError(null); }
      setCart(previous => refreshCartPrices(previous, latestProducts));
    } catch (error) { if (request === catalogRevision.current) setCatalogError(error); throw error; }
    finally { if (request === catalogRevision.current) setCatalogLoading(false); }
  };
  const decrementCart = (key) => {
    setCart(prev => {
      const existing = prev[key];
      if (!existing) return prev;
      if (existing.qty === 1) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...existing, qty: existing.qty - 1 } };
    });
  };

  const toggleFavorite = (productId) => {
    setFavoriteIds(prev => (
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    ));
  };

  const repeatOrder = (order) => {
    if (!order?.items?.length) return;
    const nextCart = {};

    order.items.forEach(item => {
      const product = getProductById(products, item.id);
      if (!product) return;
      const selected = (item.modifiers || []).map(m => {
        const current = modifiers.find(p => p.id === (m.id || m.product_id));
        return current ? { id: current.id, name: current.name, quantity: m.quantity, unitPrice: current.price } : null;
      });
      if (selected.some(m => !m)) return;
      const line = makeCartItem(product, selected, item.qty, item.preparationNote);
      if (line) nextCart[line.key] = line;
    });

    // Все позиции исчезли из меню — не стираем текущую корзину пустой.
    if (!Object.keys(nextCart).length) return;
    setCart(nextCart);
  };

  // pickupTime/pickupPoint/total/earnedBonuses/itemCount — как раньше, локальные
  // детали оформления. supabaseOrderId/supabaseOrderNumber — приходят из
  // CartScreen ПОСЛЕ того, как заказ уже реально создан в Supabase (orders +
  // order_items), поэтому localOrderHistory (используется loyalty-программой,
  // профилем и историей заказов) всегда соответствует реальному заказу в БД.
  const placeOrder = ({ customerId, pickupTime, pickupPoint, total, earnedBonuses, itemCount, supabaseOrderId, supabaseOrderNumber, serverStatus, createdAt: serverCreatedAt, orderedItems }) => {
    if (customerId && customerId !== authUserRef.current) return;
    const items = orderedItems || Object.values(cart);
    const orderNumber = supabaseOrderNumber ? `№${supabaseOrderNumber}` : `SBL-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = serverCreatedAt || new Date().toISOString();

    const orderRecord = {
      id: supabaseOrderId || createdAt,
      supabaseOrderId,
      orderNumber,
      createdAt,
      pickupTime,
      pickupPoint,
      total,
      itemCount,
      earnedBonuses,
      status: serverStatus || 'new',
      items: items.map(item => ({
        key: item.key,
        id: item.id,
        qty: item.qty,
        unitPrice: item.unitPrice,
        baseUnitPrice: item.baseUnitPrice,
        modifiers: item.modifiers || [],
        preparationNote: item.preparationNote || '',
      })),
    };

    setOrderHistory(prev => [orderRecord, ...prev.filter(order => order.id !== orderRecord.id)].slice(0, 100));
    // Edits made while the request was running must survive its completion.
    setCart(previous => {
      const next = { ...previous };
      for (const item of items) {
        const key = cartKey(item.id, item.modifiers, item.preparationNote);
        if (!next[key]) continue;
        if (next[key].qty <= item.qty) delete next[key];
        else next[key] = { ...next[key], qty: next[key].qty - item.qty };
      }
      return next;
    });
    setOrderComplete({
      orderNumber,
      supabaseOrderId,
      pickupTime,
      pickupPoint,
      itemCount,
      total,
      earnedBonuses,
      status: serverStatus || 'new',
    });
    // Баннер на Главной должен появиться сразу, не дожидаясь следующего
    // refreshActiveOrder() — заказ только что реально создан в Supabase.
    if (supabaseOrderId && !ORDER_FINAL_STATUSES.includes(serverStatus)) {
      setActiveOrder({ id: supabaseOrderId, orderNumber: supabaseOrderNumber, status: serverStatus || 'new' });
    }
    void customerOrders.refresh();
  };

  const openActiveOrder = () => {
    if (!activeOrder?.id) return;
    setOrderComplete({
      orderNumber: activeOrder.orderNumber ? `№${activeOrder.orderNumber}` : null,
      supabaseOrderId: activeOrder.id,
      status: activeOrder.status,
    });
  };

  const finishActiveOrder = () => {
    setActiveOrder(null);
    void customerOrders.refresh();
  };

  const dismissCheckoutRecoveryNotice = () => {
    setCheckoutRecoveryNotice(null);
  };

  // DEV-only помощники для ручного тестирования серии посещений без ожидания
  // реальных 10 дней (см. loyalty/loyaltyDev.js). Никогда не вызываются вне __DEV__.
  const devSimulateToday = () => {
    if (!__DEV__) return;
    setOrderHistory(prev => [buildTodaySyntheticOrder(), ...prev].slice(0, 12));
  };
  const devSimulateTenDayStreak = () => {
    if (!__DEV__) return;
    setOrderHistory(prev => [...buildSyntheticStreakOrders(10), ...prev].slice(0, 12));
  };
  const devResetLoyalty = () => {
    if (!__DEV__) return;
    setOrderHistory(prev => prev.filter(order => !order.devSynthetic));
    loyalty.devReset();
  };

  const appReady = isReady && (fontsLoaded || !!fontError);
  return (
    <FontReadyContext.Provider value={fontsLoaded}>
    <SafeAreaProvider>
      <StatusBar style={launchDone ? 'dark' : 'light'} />
      {appReady ? <View style={{ flex: 1 }} accessibilityElementsHidden={!launchDone} importantForAccessibility={launchDone ? 'auto' : 'no-hide-descendants'}>
      <NavigationContainer ref={navigationRef} onReady={() => setNavigationVersion(value => value + 1)} onStateChange={() => setNavigationVersion(value => value + 1)} documentTitle={{ formatter: () => 'SBL' }}>
        {orderComplete ? (
          <OrderSuccessScreen
            order={orderComplete}
            onDone={() => setOrderComplete(null)}
            onFinished={finishActiveOrder}
          />
        ) : (
          <RootStack
            account={account}
            getCurrentCustomerId={() => authUserRef.current}
            onLogin={handleLogin}
            onLogout={handleLogout}
            cart={cart}
            favorites={favoriteIds}
            orderHistory={orderHistory}
            products={products}
            modifiers={modifiers}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            onRetryCatalog={() => { void catalogRefresh.current(); }}
            onAddToCart={addToCart}
            onIncrement={(item) => addToCart(productsById[item.id], item.modifiers || [], item.preparationNote || '')}
            onDecrement={decrementCart}
            onRefreshCheckout={refreshCheckoutPrices}
            onOrder={placeOrder}
            onToggleFavorite={toggleFavorite}
            onRepeatOrder={repeatOrder}
            loyaltyState={loyalty}
            onRedeemReward={loyalty.redeemReward}
            devSimulateToday={devSimulateToday}
            devSimulateTenDayStreak={devSimulateTenDayStreak}
            devResetLoyalty={devResetLoyalty}
            activeOrder={activeOrder}
            onOpenActiveOrder={openActiveOrder}
            onActiveOrderFinished={finishActiveOrder}
            checkoutRecoveryNotice={checkoutRecoveryNotice}
            onDismissCheckoutRecoveryNotice={dismissCheckoutRecoveryNotice}
            onRequestCheckoutRecovery={runCheckoutRecovery}
            onCheckoutAttemptUncertain={handleCheckoutAttemptUncertain}
          />
        )}
      </NavigationContainer>

      <LoyaltyRewardModal
        reward={loyalty.celebratingReward}
        onClaim={loyalty.dismissCelebration}
        onDismiss={loyalty.dismissCelebration}
      />
      {!!(customerOrders.error || bonusAccount.error || loyalty.error) && (
        <View style={{ position: 'absolute', top: 52, left: 16, right: 16, zIndex: 100, backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 13 }}>Не удалось обновить {customerOrders.error ? 'заказы' : 'бонусы и награды'}. Проверьте подключение к интернету.</Text>
          <Pressable accessibilityRole="button" onPress={() => { void customerOrders.refresh(); void bonusAccount.refresh(); void loyalty.refresh(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontWeight: '700' }}>Повторить</Text></Pressable>
        </View>
      )}
      {!!linkNotice && <View style={{ position: 'absolute', bottom: 86, left: 16, right: 16, backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textPrimary, fontSize: 14 }}>{linkNotice}</Text>
        <Pressable accessibilityRole="button" onPress={() => setLinkNotice(null)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontWeight: '700' }}>Понятно</Text></Pressable>
      </View>}
      </View> : <View style={{ flex: 1, backgroundColor: colors.launchBackground }} />}
      {!launchDone && <BrandLaunch ready={appReady} onDone={() => setLaunchDone(true)} />}
    </SafeAreaProvider>
    </FontReadyContext.Provider>
  );
}
