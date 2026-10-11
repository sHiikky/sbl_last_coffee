// screens/OrderSuccessScreen.js
// Экран статуса заказа: показывает order_number и живой статус из Supabase.
// Подписывается на postgres_changes по таблице orders (фильтр id=eq.<orderId>)
// и отписывается при размонтировании. Раньше здесь был локальный фейковый
// таймер обратного отсчёта — заменён на реальный статус из БД, потому что
// именно эту же таблицу читает панель кассира: фейковый прогресс мог разойтись
// с тем, что видит сотрудник.
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import HoloRing from '../components/HoloRing';
import PrimaryButton from '../components/PrimaryButton';
import HolographicSurface from '../components/HolographicSurface';
import { colors, spacing, brand, radius } from '../theme/tokens';
import useOrderStatus from '../hooks/useOrderStatus';

const STEP_COUNT = 4;

const STATUS_META = {
  new:       { label: 'Заказ принят',        step: 0 },
  accepted:  { label: 'Заказ подтверждён',    step: 1 },
  preparing: { label: 'Готовим напиток',      step: 2 },
  ready:     { label: 'Готов к выдаче',       step: 3 },
  completed: { label: 'Заказ выдан',          step: 4 },
  cancelled: { label: 'Заказ отменён',        step: 4 },
};

export default function OrderSuccessScreen({ order, onDone, onFinished }) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const { status: liveStatus, orderNumber: liveOrderNumber } = useOrderStatus(order?.supabaseOrderId, {
    initialStatus: order?.status || 'new',
    onFinished,
  });
  const status = liveStatus || 'new';
  const orderNumber = liveOrderNumber != null ? `№${liveOrderNumber}` : order?.orderNumber || null;

  // selectionAsync только на реальных изменениях статуса, не на первой загрузке.
  const isFirstStatusRef = useRef(true);
  useEffect(() => {
    if (!liveStatus) return;
    if (isFirstStatusRef.current) { isFirstStatusRef.current = false; return; }
    Haptics.selectionAsync();
  }, [liveStatus]);

  const meta = STATUS_META[status] || STATUS_META.new;
  const isCancelled = status === 'cancelled';
  const progressPct = Math.max(0, Math.min(100, (meta.step / STEP_COUNT) * 100));

  const headline = useMemo(() => (isCancelled ? 'Заказ отменён' : 'Заказ принят'), [isCancelled]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ marginBottom: spacing.xxl }}>
        <HoloRing size={76} innerColor={isCancelled ? colors.danger : colors.surface3}>
          <Ionicons name={isCancelled ? 'close' : 'checkmark'} size={30} color="#fff" />
        </HoloRing>
      </View>

      <Text style={{ fontSize: 27, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm }}>{headline}</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg }}>{orderNumber || 'SBL-0000'}</Text>

      <View style={{ width: '100%', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, padding: spacing.lg, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          {!isCancelled && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success, marginRight: 8 }} />}
          <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '600' }}>{meta.label}</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
          {order?.pickupPoint ? `${order.pickupPoint} · ` : ''}
          самовывоз
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: 4 }}>
          {order?.itemCount ? `${order.itemCount} поз. в заказе` : 'Детали заказа сохранятся в профиле'}
          {order?.earnedBonuses ? ` · +${order.earnedBonuses} бонусов` : ''}
        </Text>
        {!isCancelled && (
          <Text style={{ fontSize: 10.5, color: colors.textMuted, marginTop: spacing.sm }}>
            Статус обновляется автоматически
          </Text>
        )}
      </View>

      <View style={{ width: '100%', height: 9, backgroundColor: colors.skeleton, borderRadius: 999, overflow: 'hidden', marginBottom: spacing.xxl }}>
        <View style={{ width: `${progressPct}%`, height: '100%', borderRadius: 999, overflow: 'hidden' }}>
          <HolographicSurface
            variant="line"
            intensity={1.25}
            animated={!isCancelled}
            direction="horizontal"
            borderRadius={999}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      </View>

      <Text style={{ fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', color: colors.textMuted, marginVertical: spacing.xl }}>
        {brand.name} · {brand.tagline}
      </Text>

      <PrimaryButton label="На главную" onPress={onDone} />
    </View>
  );
}
