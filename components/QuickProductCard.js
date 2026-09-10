import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import PressableCard from './PressableCard';
import ProductImage from './ProductImage';
import { colors, shadow } from '../theme/tokens';
import { formatPrice } from '../data/products';

export default function QuickProductCard({ product, width = 152, onPress, onAdd, qty = 0, onIncrement, onDecrement, isFavorite = false, onToggleFavorite }) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd?.(product);
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
      style={[styles.card, { width }, shadow.level1 || shadow.card]}
      accessibilityLabel={`${product.name}, ${formatPrice(product.price)}`}
    >
      <View>
        <ProductImage
          source={product.image}
          category={product.category}
          // Без реального фото карточка не должна выглядеть "недогруженной":
          // делаем placeholder-область заметно ниже, чем зону с настоящим
          // фото — вместо большого серого поля с едва заметной иконкой.
          aspectRatio={product.image ? 1.08 : 1.7}
          borderRadius={0}
        contentFit={product.quickFit || 'cover'}
        contentPosition={product.imagePosition || 'center'}
          zoom={product.quickZoom || product.imageZoom || 1}
        />
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
        <View style={styles.footer}>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          {qty > 0 && onIncrement && onDecrement ? (
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={handleDecrement}
                hitSlop={8}
                style={styles.stepperBtn}
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${product.name}`}
              >
                <Text style={styles.stepperMinus}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperQty}>{qty}</Text>
              <TouchableOpacity
                onPress={handleIncrement}
                hitSlop={8}
                style={[styles.stepperBtn, styles.stepperBtnAccent]}
                accessibilityRole="button"
                accessibilityLabel={`Добавить ещё ${product.name}`}
              >
                <Text style={styles.stepperPlus}>+</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleAdd}
              hitSlop={8}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel={`Добавить ${product.name}`}
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
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 41,
    height: 41,
    borderRadius: 20.5,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.06)',
  },
  body: {
    padding: 10,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    height: 40,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
    textAlign: 'center',
  },
  sizeLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnAccent: { backgroundColor: colors.accent, borderWidth: 0 },
  stepperMinus: { fontSize: 15, color: colors.textPrimary, lineHeight: 16 },
  stepperPlus: { fontSize: 16, color: '#fff', lineHeight: 17 },
  stepperQty: { fontSize: 13, fontWeight: '700', minWidth: 16, textAlign: 'center', color: colors.textPrimary },
});
