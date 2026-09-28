// components/ProductCard.js
// Единая карточка товара для Меню, Главной, подборок и «С этим берут» в
// корзине. Светлая высокая карточка: товар «висит» без плашки под фото,
// название слева в две строки, цена внизу, справа внизу шеврон «›» (открывает
// товар — добавление в корзину и в избранное на его экране). Если товар уже в
// корзине, вместо шеврона компактный степпер. Сердечка на карточке нет.
// QuickProductCard — реэкспорт этого компонента.
//
// React.memo — карточка не должна перерисовываться просто потому, что экран
// Menu перерисовался из-за смены активной категории наверху или открытия
// поиска. Реально нужный ре-рендер (изменилось qty/избранное для этого
// товара) по-прежнему проходит через обычное сравнение пропсов.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableCard from './PressableCard';
import ProductImage from './ProductImage';
import Badge from './Badge';
import QuantityStepper from './QuantityStepper';
import { colors, radius, shadow } from '../theme/tokens';
import { formatPrice } from '../data/products';

const CARD_PADDING = 12;

function ProductCard({ product, width = 152, onPress, qty = 0, onIncrement, onDecrement }) {
  const name = product.displayName || product.name;

  return (
    <PressableCard
      onPress={() => onPress(product)}
      style={[styles.card, { width }]}
      accessibilityLabel={`${product.name}, ${formatPrice(product.price)}`}
    >
      <View style={styles.photoWrap}>
        <ProductImage
          source={product.image}
          category={product.category}
          aspectRatio={1}
          borderRadius={0}
          transparent
          contentFit={product.cardContentFit || 'contain'}
          contentPosition={product.imagePosition || 'center'}
          zoom={product.quickZoom || product.cardZoom || product.imageZoom || 1}
        />
        {product.badge && <Badge type={product.badge} />}
      </View>

      <View style={styles.body}>
        <View>
          <Text style={styles.title} numberOfLines={2}>{name}</Text>
          {!!product.sizeLabel && <Text style={styles.sizeLabel} numberOfLines={1}>{product.sizeLabel}</Text>}
        </View>
        <View style={styles.footer}>
          <Text style={styles.price} numberOfLines={1}>{formatPrice(product.price)}</Text>
          {qty > 0 && onIncrement && onDecrement ? (
            <QuantityStepper compact qty={qty} onIncrement={onIncrement} onDecrement={onDecrement} />
          ) : (
            // Просто иконка: нажатие обрабатывает вся карточка. Отдельная кнопка
            // внутри кнопки-карточки даёт вложенные <button> в вебе.
            <View style={styles.chevronHit} pointerEvents="none">
              <Ionicons name="chevron-forward" size={20} color="rgba(12,12,12,0.3)" />
            </View>
          )}
        </View>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.large,
    overflow: 'hidden',
    ...shadow.level1,
  },
  photoWrap: { paddingTop: CARD_PADDING, paddingHorizontal: CARD_PADDING },
  // flex: 1 + space-between: если соседняя карточка в ряду выше, нижняя
  // строка «цена + шеврон» остаётся прижатой к низу карточки.
  body: { flex: 1, justifyContent: 'space-between', paddingTop: 6, paddingRight: CARD_PADDING - 4, paddingBottom: 6, paddingLeft: CARD_PADDING },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '700', color: colors.textPrimary },
  sizeLabel: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, marginTop: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  chevronHit: { width: 44, height: 36, marginVertical: -4, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
});

export default React.memo(ProductCard);
