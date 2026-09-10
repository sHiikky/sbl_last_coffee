import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, Alert } from 'react-native';
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
import Chip from '../components/Chip';
import { colors, spacing, radius, shadow, getHorizontalPadding } from '../theme/tokens';
import { PICKUP_TIMES, PICKUP_POINTS, formatPrice } from '../data/products';
import { getAvailableRewards, isRewardApplicable, getEligibleCartItemsForReward } from '../loyalty/loyaltyService';
import { supabase, getUserOrThrow } from '../lib/supabaseClient';
import useBonusAccount from '../hooks/useBonusAccount';
import { getBonusLevel, maxRedeemable } from '../lib/bonusConfig';

export default function CartScreen({ navigation, cart, onIncrement, onDecrement, onOrder, tabBarHeight, loyaltyState, onRedeemReward }) {
  const [promo, setPromo] = useState('');
  const [promoState, setPromoState] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const [pickupTime, setPickupTime] = useState(PICKUP_TIMES[1]);
  const [pickupPoint, setPickupPoint] = useState(PICKUP_POINTS[0]);
  const [appliedRewardId, setAppliedRewardId] = useState(null);
  const [redeemBonuses, setRedeemBonuses] = useState(false);
  const bonusAccount = useBonusAccount();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const mountedRef = useRef(true);

  const items = Object.values(cart);
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const discount = promoState === 'ok' ? Math.round(subtotal * 0.1) : 0;

  const availableReward = getAvailableRewards(loyaltyState?.rewards || [])[0] || null;
  const rewardApplicable = availableReward ? isRewardApplicable(availableReward, cart) : false;
  const rewardEligibleItems = availableReward ? getEligibleCartItemsForReward(cart, availableReward) : [];
  const rewardApplied = rewardApplicable && appliedRewardId === availableReward?.id;
  const rewardDiscount = rewardApplied ? (rewardEligibleItems[0]?.unitPrice || 0) : 0;

  const serviceFee = subtotal > 0 ? 0 : 0;
  const total = Math.max(0, subtotal - discount - rewardDiscount + serviceFee);

  // total остаётся полной стоимостью товаров (совпадает с суммой order_items,
  // как и раньше) — списание бонусов не скидка, а отдельный способ оплаты
  // части total; сколько просить деньгами на кассе = total - bonusRedeemed.
  const maxBonusRedeemable = maxRedeemable(total, bonusAccount.balance);
  const bonusRedeemed = redeemBonuses ? maxBonusRedeemable : 0;
  const payTotal = total - bonusRedeemed;

  // Кэшбек начисляется бэкендом только с денежной части (см. миграцию) —
  // эта оценка только для UI, реальную сумму и уровень всегда считает триггер.
  const bonusRate = getBonusLevel(bonusAccount.lifetimePaid).rate;
  const earnedBonuses = Math.floor(payTotal * bonusRate);

  const applyPromo = () => {
    const ok = promo.trim().toUpperCase() === 'SBL10';
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setPromoState(ok ? 'ok' : 'err');
  };

  const toggleReward = () => {
    if (!availableReward || !rewardApplicable) return;
    Haptics.selectionAsync();
    setAppliedRewardId(prev => (prev === availableReward.id ? null : availableReward.id));
  };

  // Оформление заказа реально пишет в Supabase (orders + order_items) — та же
  // таблица, которую читает панель кассира. Локальный orderHistory (нужен
  // loyalty-программе и профилю) обновляется только ПОСЛЕ успешной записи в
  // БД, чтобы локальное состояние никогда не расходилось с реальным заказом.
  const handleOrder = async () => {
    if (ordering) return;
    setOrdering(true);

    try {
      // Аутентификация тихая и анонимная (ensureAnonymousSession в App.js,
      // signInAnonymously) — телефон нигде не запрашивается и не
      // подтверждается, никакого экрана входа перед этим нет.
      const user = await getUserOrThrow();

      const { data: orderRow, error: orderError } = await supabase
        .from('orders')
        .insert({ customer_id: user.id, status: 'new', total, bonus_redeemed: bonusRedeemed })
        .select()
        .single();
      if (orderError) throw orderError;

      // Одна из позиций может быть частично или полностью покрыта наградой
      // (rewardDiscount вычтен из total выше) — разбиваем её строку так,
      // чтобы сумма price*quantity по order_items совпадала с total и не
      // расходилась с ним в отчётах/кассе.
      const freeItemKey = rewardApplied ? rewardEligibleItems[0]?.key : null;
      const orderItemsPayload = items.flatMap(item => {
        if (item.key === freeItemKey) {
          const rows = [{ order_id: orderRow.id, product_name: item.name, quantity: 1, price: 0 }];
          if (item.qty > 1) {
            rows.push({ order_id: orderRow.id, product_name: item.name, quantity: item.qty - 1, price: item.unitPrice });
          }
          return rows;
        }
        return [{ order_id: orderRow.id, product_name: item.name, quantity: item.qty, price: item.unitPrice }];
      });
      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload);
      if (itemsError) {
        // orders-строка уже создана и видна кассе — без отката она навсегда
        // остаётся "пустым" заказом без единой позиции.
        await supabase.from('orders').delete().eq('id', orderRow.id);
        throw itemsError;
      }

      if (rewardApplied && availableReward) {
        onRedeemReward?.(availableReward.id);
        setAppliedRewardId(null);
      }

      setRedeemBonuses(false);

      onOrder({
        pickupTime,
        pickupPoint,
        total: payTotal,
        earnedBonuses,
        itemCount,
        supabaseOrderId: orderRow.id,
        supabaseOrderNumber: orderRow.order_number,
      });
    } catch (error) {
      console.warn('[order] failed to create order in Supabase', error);
      Alert.alert(
        'Не удалось оформить заказ',
        error?.message || 'Проверьте подключение к интернету и попробуйте снова.'
      );
    } finally {
      if (mountedRef.current) setOrdering(false);
    }
  };

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScreenHeader title="Корзина" showEyebrow={false} showLine={false} />
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
        <ScreenHeader title="Корзина" showEyebrow={false} showLine={false} />
      </View>

      <FlatList
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
              contentFit={item.imageFit || 'contain'}
              contentPosition={item.imagePosition || 'center'}
              zoom={item.imageZoom || 1.08}
              style={{ width: 64 }}
            />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
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
            <View style={[styles.summaryBox, shadow.card]}>
              <Text style={styles.sectionCaption}>Точка самовывоза</Text>
              <View style={styles.chipWrap}>
                {PICKUP_POINTS.map(point => (
                  <Chip key={point} label={point} active={pickupPoint === point} onPress={() => setPickupPoint(point)} />
                ))}
              </View>
            </View>

            <View style={[styles.summaryBox, shadow.card]}>
              <Text style={styles.sectionCaption}>Время самовывоза</Text>
              <View style={styles.chipWrap}>
                {PICKUP_TIMES.map(slot => (
                  <Chip key={slot} label={slot} active={pickupTime === slot} onPress={() => setPickupTime(slot)} />
                ))}
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
                onChangeText={text => { setPromo(text); setPromoState(null); }}
                placeholder="Промокод (SBL10)"
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, fontSize: 13, color: colors.textPrimary }}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={applyPromo} accessibilityRole="button" accessibilityLabel="Применить промокод">
                <Text style={{ fontSize: 12, fontWeight: '700', color: promoState === 'ok' ? colors.success : colors.accent }}>
                  {promoState === 'ok' ? '✓ −10%' : 'Применить'}
                </Text>
              </TouchableOpacity>
            </View>
            {promoState === 'err' && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}>Промокод недействителен</Text>}

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
              <Text style={styles.pickupHintText}>Соберём заказ в течение 15 минут · {pickupPoint}</Text>
            </View>

            <View style={{ marginTop: spacing.lg, paddingBottom: tabBarHeight + spacing.lg }}>
              <PrimaryButton fullWidth loading={ordering} label="Оформить заказ" onPress={handleOrder} haptic="success" variant="holo" />
            </View>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  itemName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  itemMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: colors.accent, marginTop: 4 },
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
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
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
