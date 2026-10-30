// screens/FavoritesScreen.js
// Избранное — открывается из пункта «Избранное» в профиле. Сердечко ставится на
// экране товара; здесь сохранённые товары показываются той же ProductCard.
import React, { useMemo } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import { colors, spacing, getHorizontalPadding } from '../theme/tokens';
import { cartKey } from '../data/products';

const COLUMN_GAP = 12;

export default function FavoritesScreen({ navigation, favoriteIds = [], products = [], cart = {}, onAddToCart, onDecrement }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const cardWidth = Math.floor((width - hPad * 2 - COLUMN_GAP) / 2);

  // Товар мог пропасть из каталога — такие id просто не показываем.
  const favorites = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p]));
    return favoriteIds.map(id => byId.get(id)).filter(Boolean);
  }, [favoriteIds, products]);

  const goProduct = (product) => navigation.navigate('Product', { product });
  const goMenu = () => navigation.navigate('Tabs', { screen: 'MenuTab' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Избранное</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {favorites.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title="Пока ничего нет"
            subtitle="Нажмите на сердечко на экране товара, и он появится здесь"
            action={<PrimaryButton label="Перейти в меню" onPress={goMenu} />}
          />
        ) : (
          <View style={styles.grid}>
            {favorites.map(product => {
              const qty = cart[cartKey(product.id)]?.qty || 0;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  width={cardWidth}
                  onPress={goProduct}
                  qty={qty}
                  onIncrement={() => onAddToCart?.(product)}
                  onDecrement={() => onDecrement?.(cartKey(product.id))}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: COLUMN_GAP, rowGap: COLUMN_GAP },
});
