// components/profile/OrderHistorySection.js
// Список всех заказов пользователя в профиле (+ пустое состояние).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OrderHistoryCard from './OrderHistoryCard';
import { colors, spacing, radius } from '../../theme/tokens';

export default function OrderHistorySection({ orders = [], products = [], onRepeat, onGoToMenu }) {
  if (!orders.length) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyRow}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={20} color={colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>Заказов пока нет</Text>
            <Text style={styles.emptySubtitle}>После первого заказа здесь появится история покупок.</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={onGoToMenu}
          accessibilityRole="button"
          accessibilityLabel="Перейти в меню"
        >
          <Text style={styles.emptyButtonText}>Перейти в меню</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>История заказов</Text>
      <View style={{ gap: spacing.md }}>
        {orders.map(order => (
          <OrderHistoryCard key={order.id} order={order} products={products} onRepeat={onRepeat} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  emptyWrap: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.07)',
    padding: spacing.lg,
  },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  emptySubtitle: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  emptyButton: {
    marginTop: spacing.lg,
    minHeight: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: { fontSize: 13.5, fontWeight: '600', color: colors.textPrimary },
});
