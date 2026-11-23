import React, { useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import Text from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import HoloRing from '../components/HoloRing';
import OrderPreparationProgress from '../components/OrderPreparationProgress';
import PrimaryButton from '../components/PrimaryButton';
import { colors, spacing, brand, radius, typography } from '../theme/tokens';
import { formatPrice } from '../data/products';
import { orderStatusPresentation, orderCashDue, orderNumberLabel, orderPickupLabel } from '../lib/orderPresentation';
import useOrderStatus from '../hooks/useOrderStatus';

export default function OrderSuccessScreen({ order, onDone, onFinished }) {
  const insets = useSafeAreaInsets();
  const orderId = order?.supabaseOrderId;
  const { status: liveStatus, orderNumber: liveOrderNumber, details, error, refreshing, lastUpdatedAt, refresh } = useOrderStatus(orderId, {
    initialStatus: orderId ? order?.status : null,
    onFinished,
  });
  const status = orderId ? liveStatus || order?.status : null;
  const meta = orderStatusPresentation(status);
  const orderNumber = orderId ? orderNumberLabel(liveOrderNumber ?? order?.orderNumber) : null;
  const cashDue = orderId ? orderCashDue(details, order) : null;
  const pickup = orderPickupLabel(details, order);
  const address = details?.pickup_point || order?.pickupPoint;
  const customer = [details?.customer_name || order?.customerName, details?.customer_phone || order?.customerPhone].filter(Boolean).join(' · ');
  const paidAt = details?.paid_at || order?.paidAt;
  const previousStatus = useRef({ orderId, status });

  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = { orderId, status };
    if (Platform.OS === 'web' || previous.orderId !== orderId || !previous.status || !status || previous.status === status) return;
    try {
      const feedback = status === 'ready'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.selectionAsync();
      Promise.resolve(feedback).catch(() => {});
    } catch (_) { /* Unsupported haptics never interrupt status updates. */ }
  }, [orderId, status]);

  const updatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tomsk', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero} accessibilityLiveRegion="polite">
          <HoloRing size={76} innerColor={meta.isCancelled ? colors.danger : colors.surface3}>
            <Ionicons name={meta.icon} size={32} color={colors.textOnDark} />
          </HoloRing>
          <Text style={styles.headline}>{meta.headline}</Text>
          <Text style={styles.description}>{meta.description}</Text>
          {orderNumber ? <View style={styles.numberPill}><Text style={styles.number}>{orderNumber}</Text><Text style={styles.numberHint}>НАЗОВИТЕ НОМЕР В КОФЕЙНЕ</Text></View>
            : <Text style={styles.pendingNumber}>Номер появится после подтверждения сервера</Text>}
        </View>

        <View style={styles.details}>
          <View style={styles.detailHeading}><Ionicons name="bag-handle-outline" size={20} color={colors.textPrimary} /><Text style={styles.detailTitle}>Самовывоз</Text></View>
          {!!address && <Text style={styles.address}>{address}</Text>}
          {!!pickup && <View style={styles.detailRow}><Text style={styles.detailLabel}>{meta.isFinal ? 'Время самовывоза' : 'Самовывоз к'}</Text><Text style={styles.detailValue}>{pickup}</Text></View>}
          {!!customer && <View style={styles.detailRow}><Text style={styles.detailLabel}>Получатель</Text><Text style={styles.detailValue}>{customer}</Text></View>}
          {cashDue !== null && <View style={[styles.detailRow, styles.amountRow]}><Text style={styles.detailLabel}>{meta.isCancelled || (status === 'completed' && !paidAt) ? 'Сумма заказа' : paidAt ? 'Оплачено' : 'К оплате при получении'}</Text><Text style={styles.amount}>{formatPrice(cashDue)}</Text></View>}
          {!!order?.itemCount && <Text style={styles.caption}>{order.itemCount} поз. в заказе</Text>}
        </View>

        {!meta.isCancelled && !!status && <OrderPreparationProgress status={status} changedAt={details?.updated_at || order?.updatedAt} />}

        {!!error && <View style={styles.networkNotice} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-offline-outline" size={22} color={colors.textPrimary} />
          <View style={styles.networkBody}><Text style={styles.networkTitle}>Не удалось обновить статус</Text><Text style={styles.caption}>Показаны последние полученные данные. Проверьте связь — заказ повторно оформлять не нужно.</Text></View>
        </View>}
        {!orderId && <Text style={styles.caption}>Не удалось открыть подтверждённый заказ. Проверьте историю в профиле.</Text>}
        {!!orderId && <View style={styles.refreshRow}>
          <Text style={[styles.caption, styles.refreshText]}>{error ? 'Продолжаем попытки обновления' : updatedLabel ? `Обновлено в ${updatedLabel} по Томску` : 'Получаем статус с сервера…'}</Text>
          <Pressable onPress={() => { void refresh(); }} disabled={refreshing} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Обновить статус заказа" accessibilityState={{ disabled: refreshing }}>
            <Text style={styles.refreshButtonText}>{refreshing ? 'Обновляем…' : 'Обновить'}</Text>
          </Pressable>
        </View>}
        <Text style={styles.brand}>{brand.name} · {brand.tagline}</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}><PrimaryButton fullWidth label="На главную" onPress={onDone} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.xxl },
  headline: { ...typography.screenTitle, fontSize: 28, textAlign: 'center', color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  description: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center', maxWidth: 330 },
  numberPill: { backgroundColor: colors.surfaceElevated, borderRadius: radius.large, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.xl, alignItems: 'center' },
  number: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -1, color: colors.textPrimary },
  numberHint: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.xs },
  pendingNumber: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  details: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, padding: spacing.lg },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  detailTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  address: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, marginBottom: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  detailLabel: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  detailValue: { flex: 1.2, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'right', color: colors.textPrimary },
  amountRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, alignItems: 'center' },
  amount: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.textPrimary },
  caption: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  progressSection: { marginTop: spacing.xl },
  progressTrack: { height: 7, borderRadius: radius.pill, backgroundColor: colors.skeleton, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  networkNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.medium, padding: spacing.md, marginTop: spacing.xl },
  networkBody: { flex: 1 },
  networkTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  refreshText: { flex: 1 },
  refreshButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  refreshButtonText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  brand: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, backgroundColor: colors.surfaceElevated, borderTopWidth: 1, borderTopColor: colors.border },
});
