import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import PressableCard from './PressableCard';
import ProductImage from './ProductImage';
import Badge from './Badge';
import { colors, radius, spacing, shadow } from '../theme/tokens';
import { formatPrice } from '../data/products';

export default function ProductCard({ product, width, onPress, onAdd, qty = 0, onIncrement, onDecrement, isFavorite = false, onToggleFavorite }) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(product);
  };

  const handleIncrement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onIncrement?.();
  };

  const handleDecrement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDecrement?.();
  };

  return (
    <PressableCard
      onPress={() => onPress(product)}
      style={[styles.card, { width }, shadow.card]}
      accessibilityLabel={product.name + ', ' + formatPrice(product.price)}
    >
      <View>
        <ProductImage
          source={product.image}
          category={product.category}
          aspectRatio={1.42}
          borderRadius={0}
          contentFit={product.cardFit || 'cover'}
          contentPosition={product.imagePosition || 'center'}
          zoom={product.cardZoom || product.imageZoom || 1}
        />
        {product.badge && <Badge type={product.badge} />}
        {onToggleFavorite && (
          <TouchableOpacity
            onPress={() => onToggleFavorite(product.id)}
            hitSlop={8}
            style={styles.favoriteButton}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? `Убрать ${product.name} из избранного` : `Добавить ${product.name} в избранное`}
          >
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={21} color={isFavorite ? colors.accent : colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{product.displayName || product.name}</Text>
        {!!product.sizeLabel && (
          <Text style={styles.sizeLabel} numberOfLines={1}>{product.sizeLabel}</Text>
        )}
        {!!product.shortDescription && (
          <Text style={styles.desc} numberOfLines={1}>{product.shortDescription}</Text>
        )}
        <View style={styles.footer}>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          {qty > 0 && onIncrement && onDecrement ? (
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={handleDecrement}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={'Убрать ' + product.name}
                style={styles.stepperBtn}
              >
                <Text style={styles.stepperMinus}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperQty}>{qty}</Text>
              <TouchableOpacity
                onPress={handleIncrement}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={'Добавить ещё ' + product.name}
                style={[styles.stepperBtn, styles.stepperBtnAccent]}
              >
                <Text style={styles.stepperPlus}>+</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleAdd}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={'Добавить ' + product.name + ' в корзину'}
              style={styles.addButton}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.xlarge,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadow.level2,
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 41,
    height: 41,
    borderRadius: 20.5,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.06)',
  },
  body: { padding: 10 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 3, lineHeight: 20, height: 40, textAlign: 'center' },
  sizeLabel: { color: colors.textMuted, marginBottom: 4, fontSize: 12, textAlign: 'center' },
  desc: { color: colors.textMuted, marginBottom: 4, lineHeight: 13, fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  addButton: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.button,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.background, borderRadius: radius.pill, padding: 3,
  },
  stepperBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnAccent: { backgroundColor: colors.accent, ...shadow.button },
  stepperMinus: { fontSize: 15, color: colors.textPrimary, lineHeight: 16 },
  stepperPlus: { fontSize: 16, color: '#fff', lineHeight: 17 },
  stepperQty: { fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center', color: colors.textPrimary },
});
