// loyalty/useLoyaltyState.js
// Единственное место в приложении, где loyalty-домен встречается с React.
// Владеет: загрузкой/сохранением persisted-метадаты, накоплением visitedDays
// поверх ограниченного orderHistory (см. loyaltyStorage.js), idempotent-выдачей
// наград и celebratory-модалкой. Экран/компоненты только читают то, что хук
// возвращает, и вызывают redeemReward — currentStreak нигде не инкрементируется
// напрямую из UI.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { LOYALTY_CONFIG } from './loyaltyConfig.js';
import {
  deriveVisitedDaysFromOrders,
  computeLoyaltyStateFromVisitedDays,
  reconcileLoyaltyMilestones,
} from './loyaltyService.js';
import { loadLoyaltyMetadata, saveLoyaltyMetadata, clearLoyaltyMetadata } from './loyaltyStorage.js';

const EMPTY_METADATA = { visitedDays: [], milestonesClaimed: [], rewards: [] };

export default function useLoyaltyState(orderHistory) {
  const [metadata, setMetadata] = useState(EMPTY_METADATA);
  const [ready, setReady] = useState(false);
  // Очередь, а не одно значение: если streak перепрыгнет сразу через
  // несколько milestone'ов за один тик (например, добавят награду за 20 дней
  // и она будет достигнута в той же сверке, что и 10-дневная), модалка должна
  // показать их по очереди, а не молча потерять все, кроме последней.
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const loadedOnceRef = useRef(false);
  // Три независимых эффекта (merge visitedDays, milestone-реконсиляция,
  // redeemReward) вызывают saveLoyaltyMetadata без await — без сериализации
  // их AsyncStorage-записи могут разрешиться не в том порядке, в котором были
  // вызваны, и более старый снимок перезапишет более новый. Цепочка промисов
  // гарантирует порядок записи = порядку вызова.
  const writeQueueRef = useRef(Promise.resolve());
  const queueSaveMetadata = useCallback(next => {
    writeQueueRef.current = writeQueueRef.current.then(() => saveLoyaltyMetadata(next));
    return writeQueueRef.current;
  }, []);

  // 1. Первичная загрузка persisted-метадаты.
  useEffect(() => {
    let mounted = true;
    loadLoyaltyMetadata().then(loaded => {
      if (!mounted) return;
      setMetadata(loaded);
      setReady(true);
      loadedOnceRef.current = true;
    });
    return () => { mounted = false; };
  }, []);

  // 2. Каждый раз, когда orderHistory меняется (новый успешный заказ), сливаем
  // свежие qualifying-дни с уже накопленными. Слияние монотонно (union,
  // никогда не удаляет дни) — это и есть защита от того, что App.js хранит
  // только последние 12 заказов.
  useEffect(() => {
    if (!ready) return;
    const freshDays = deriveVisitedDaysFromOrders(orderHistory, LOYALTY_CONFIG);
    if (freshDays.length === 0) return;

    setMetadata(prev => {
      const merged = Array.from(new Set([...(prev.visitedDays || []), ...freshDays])).sort();
      if (merged.length === (prev.visitedDays || []).length) return prev;
      return { ...prev, visitedDays: merged };
    });
  }, [orderHistory, ready]);

  // Вычисленное состояние (streak/today/cycle) — производное от накопленного visitedDays.
  const loyaltyState = useMemo(
    () => computeLoyaltyStateFromVisitedDays(metadata.visitedDays, LOYALTY_CONFIG),
    [metadata.visitedDays]
  );

  // 3. Идемпотентная выдача наград за достигнутые milestone'ы + сохранение.
  useEffect(() => {
    if (!ready) return;

    const { milestonesClaimed, rewards, newlyEarnedRewards } = reconcileLoyaltyMilestones(
      loyaltyState,
      metadata,
      LOYALTY_CONFIG
    );

    if (newlyEarnedRewards.length === 0) return;

    setMetadata(prev => {
      const next = { ...prev, milestonesClaimed, rewards };
      queueSaveMetadata(next);
      return next;
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCelebrationQueue(prev => [...prev, ...newlyEarnedRewards]);
    // Намеренно не зависим от `metadata` целиком (только от вычисленного streak) —
    // иначе reconcile гонялся бы на каждое собственное сохранение и мог зациклиться.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loyaltyState.currentStreak, loyaltyState.currentStreakStartDay]);

  // Персистим visitedDays отдельно от reward-эффекта, чтобы merge из шага 2 тоже сохранялся.
  useEffect(() => {
    if (!ready || !loadedOnceRef.current) return;
    queueSaveMetadata(metadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata.visitedDays]);

  const dismissCelebration = useCallback(() => setCelebrationQueue(prev => prev.slice(1)), []);

  const redeemReward = useCallback((rewardId) => {
    setMetadata(prev => {
      const rewards = prev.rewards.map(r => (
        r.id === rewardId && r.status === 'available'
          ? { ...r, status: 'redeemed', redeemedAt: new Date().toISOString() }
          : r
      ));
      const next = { ...prev, rewards };
      queueSaveMetadata(next);
      return next;
    });
  }, []);

  const devReset = useCallback(async () => {
    if (!__DEV__) return;
    await clearLoyaltyMetadata();
    setMetadata(EMPTY_METADATA);
    setCelebrationQueue([]);
  }, []);

  return {
    ready,
    ...loyaltyState,
    rewards: metadata.rewards,
    milestonesClaimed: metadata.milestonesClaimed,
    celebratingReward: celebrationQueue[0] || null,
    dismissCelebration,
    redeemReward,
    devReset,
  };
}
