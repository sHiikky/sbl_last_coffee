import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import PressableCard from './PressableCard';
import ProductImage from './ProductImage';
import { colors, radius, spacing, shadow, typography } from '../theme/tokens';
import { formatPrice } from '../data/products';

export default function QuickPickCard({ product, width = 150, onPress, onAdd }) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(product);
  };
  return (
    <PressableCard onPress={() => onPress(product)} style={[styles.card, { width }, shadow.card]}>
      <ProductImage
        source={product.image}
        category={product.category}
        aspectRatio={1.2}
        borderRadius={0}
        contentFit={product.quickFit || 'cover'}
        contentPosition={product.imagePosition || 'center'}
        zoom={product.quickZoom || product.imageZoom || 1}
      />
      <View style={styles.body}>
        <Text style={[typography.cardTitle, { fontSize: 13, color: colors.textPrimary }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]} numberOfLines={1}>{product.description}</Text>
        <View style={styles.footer}>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          <TouchableOpacity onPress={handleAdd} hitSlop={8} style={styles.addButton} accessibilityRole="button" accessibilityLabel={'Добавить ' + product.name}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface2, borderRadius: radius.large, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginRight: spacing.md },
  body: { padding: 12, minHeight: 96, justifyContent: 'space-between' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
