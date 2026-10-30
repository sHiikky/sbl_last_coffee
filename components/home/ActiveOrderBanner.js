// components/home/ActiveOrderBanner.js
// Карточка активного заказа на Главной — как у "Вкусно и точка": пока заказ
// не завершён/отменён, его видно и можно открыть повторно, даже после того
// как пользователь закрыл OrderSuccessScreen кнопкой "На главную" или совсем
// перезапустил приложение (activeOrder в App.js восстанавливается из Supabase
// при старте, см. refreshActiveOrder).
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import useOrderStatus from '../../hooks/useOrderStatus';
import { colors, spacing, radius, shadow } from '../../theme/tokens';

const STATUS_LABEL = {
  new: 'Отправлен · ждёт подтверждения',
  accepted: 'Заказ подтверждён',
  preparing: 'Готовим ваш напиток',
  ready: 'Готово к выдаче — заберите заказ',
};

export default function ActiveOrderBanner({ activeOrder, onPress, onFinished }) {
  const { status, orderNumber, error } = useOrderStatus(activeOrder?.id, {
    initialStatus: activeOrder?.status,
    onFinished,
  });

  if (!activeOrder?.id) return null;
  if (!status || status === 'completed' || status === 'cancelled') return null;

  const displayNumber = orderNumber != null ? orderNumber : activeOrder.orderNumber;
  const title = displayNumber ? `Заказ №${displayNumber}` : 'Текущий заказ';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.wrap, shadow.card]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${STATUS_LABEL[status] || 'обрабатывается'}`}
    >
      <View style={styles.dot} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{STATUS_LABEL[status] || 'Заказ обрабатывается'}</Text>
        {!!error && <Text style={styles.subtitle}>Нет связи · последний известный статус</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
