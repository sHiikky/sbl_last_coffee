import React from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Text from './AppText';
import QuickProductCard from './QuickProductCard';
import { colors, spacing } from '../theme/tokens';

export default function HorizontalProductSection({
  title = 'Быстрый выбор',
  actionLabel = 'Смотреть всё',
  products = [],
  hPad = 20,
  onAction,
  onOpenProduct,
  onAddProduct,
  getQty,
  onIncrementProduct,
  onDecrementProduct,
  favoriteIds,
  onToggleFavorite,
}) {
  if (!products.length) return null;

  return (
    <View style={{ marginTop: spacing.xxl }}>
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <Text style={styles.title}>{title}</Text>
        {onAction && (
          <TouchableOpacity onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: hPad, paddingRight: hPad + 8, gap: spacing.md }}
      >
        {products.map(product => (
          <QuickProductCard
            key={product.id}
            product={product}
            onPress={onOpenProduct}
            onAdd={onAddProduct}
            qty={getQty ? getQty(product.id) : 0}
            onIncrement={onIncrementProduct ? () => onIncrementProduct(product) : undefined}
            onDecrement={onDecrementProduct ? () => onDecrementProduct(product.id) : undefined}
            isFavorite={favoriteIds ? favoriteIds.includes(product.id) : false}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  action: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
