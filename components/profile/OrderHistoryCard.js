// components/profile/OrderHistoryCard.js
// Карточка одного заказа в истории профиля.
// Фото и название берём из каталога по id первого товара заказа.
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import ProductImage from '../ProductImage';
import { getProductById } from '../../data/products';
import { colors, spacing, radius, shadow } from '../../theme/tokens';


function formatDate(dateString) {
  try {
    return new Date(dateString).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch {
    return 'Недавно';
  }
}

function pluralPositions(n) {
  return n === 1 ? 'позиция' : n < 5 ? 'позиции' : 'позиций';
}

export default function OrderHistoryCard({ order, products = [], onRepeat }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.timing(scale, { toValue: 0.96, duration: 110, useNativeDriver: true }).start();
  const pressOut = () => Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }).start();

  const handleRepeat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRepeat?.(order);
  };

  const firstItem = order.items?.[0];
  const firstProduct = firstItem ? getProductById(products, firstItem.id) : null;
  const itemCount = order.itemCount ?? 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.orderNumber} numberOfLines={1}>{order.orderNumber}</Text>
        <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
      </View>

      <View style={styles.body}>
        <ProductImage
          source={firstProduct?.image}
          category={firstProduct?.category}
          aspectRatio={1}
          borderRadius={17}
          contentFit={firstProduct?.cardFit || 'cover'}
          contentPosition={firstProduct?.imagePosition || 'center'}
          style={styles.thumb}
        />

        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.productLine} numberOfLines={1}>
            {firstProduct?.name || 'Напиток SBL'}{itemCount ? ` · ${itemCount} ${pluralPositions(itemCount)}` : ''}
          </Text>

          <View style={styles.footerRow}>
            <Text style={styles.price}>{order.total.toLocaleString('ru-RU')} ₽</Text>
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity
                style={styles.repeatButton}
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={handleRepeat}
                accessibilityRole="button"
                accessibilityLabel="Повторить заказ"
                hitSlop={6}
              >
                <Text style={styles.repeatButtonText}>Повторить</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.07)',
    padding: spacing.lg,
    ...shadow.level1,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  orderNumber: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  date: { fontSize: 12.5, color: colors.textMuted },
  body: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 108 },
  productLine: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  price: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  repeatButton: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatButtonText: { fontSize: 14, fontWeight: '600', color: colors.accent },
});
