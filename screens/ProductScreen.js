import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Share, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import ProductImage from '../components/ProductImage';
import Badge from '../components/Badge';
import QuantityStepper from '../components/QuantityStepper';
import { colors, spacing, radius, shadow, typography, getHorizontalPadding } from '../theme/tokens';
import { formatPrice, cartKey } from '../data/products';
import { splitNameAndSize } from '../lib/catalogService';

// Плавающая панель действий: 8 + кнопка 56 + 8, поднята над нижним краем на 12.
const ACTION_BAR_HEIGHT = 72;
const ACTION_BAR_GAP = 12;
const SHEET_MAX_SHARE = 0.7; // шторка «Подробнее» занимает не больше 70% высоты экрана

function sizeNumber(label) {
  const match = String(label || '').match(/\d+[.,]?\d*/);
  return match ? parseFloat(match[0].replace(',', '.')) : 0;
}

// Варианты объёма: в меню СБИС каждый объём — отдельная позиция с тем же
// названием. Если у товара есть «братья» с тем же названием и разделом,
// показываем переключатель; иначе — нет (выдумывать размеры нельзя).
function findVariants(products, product) {
  const same = products.filter(p => p.menuCategory === product.menuCategory && p.displayName === product.displayName);
  const list = same.some(p => p.id === product.id) ? same : [...same, product];
  if (list.length < 2) return [product];
  return [...list].sort((a, b) => sizeNumber(a.sizeLabel) - sizeNumber(b.sizeLabel));
}

function formatNutrition(value, unit) {
  if (value === null) return '—';
  return `${String(value).replace('.', ',')} ${unit}`;
}

// Раньше здесь был выбор размера/молока/температуры/добавок — в реальном
// меню СБИС у каждого такого варианта уже отдельная позиция со своей ценой
// (например, "Чай 500 мл" — сам по себе товар), поэтому экран просто
// показывает товар и добавляет его в корзину как есть, без надбавок сверху.
export default function ProductScreen({
  route,
  navigation,
  cart = {},
  products = [],
  onAddToCart,
  onDecrement,
  onToggleFavorite,
  favoriteIds = [],
}) {
  const { product: openedProduct } = route.params;
  const [selectedId, setSelectedId] = useState(openedProduct.id);
  const variants = useMemo(() => findVariants(products, openedProduct), [products, openedProduct]);
  // Активный вариант объёма: от него зависят цена, КБЖУ и что уходит в корзину.
  const product = variants.find(v => v.id === selectedId) || openedProduct;
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const [added, setAdded] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);
  // Анимация открытия и закрытия экрана: контент плавно всплывает, фото слегка «оседает».
  const openAnim = useRef(new Animated.Value(0)).current;
  // Шторка «Подробнее»: выезжает снизу вверх.
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(openAnim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [openAnim]);

  const price = product.price;
  const { displayName, sizeLabel } = product.displayName
    ? { displayName: product.displayName, sizeLabel: product.sizeLabel }
    : splitNameAndSize(product.name);
  const isFavorite = favoriteIds.includes(product.id);
  const qty = cart[cartKey(product.id)]?.qty || 0;

  const kicker = [product.menuCategory, product.menuSubcategory, sizeLabel]
    .filter((part, index, all) => !!part && all.indexOf(part) === index)
    .join(' · ');

  const barBottom = insets.bottom + ACTION_BAR_GAP;
  const barTotal = ACTION_BAR_HEIGHT + barBottom;
  const sheetMaxHeight = windowHeight * SHEET_MAX_SHARE;

  const handleShare = () => {
    Share.share({ message: `${product.name} — ${formatPrice(price)} · SBL` }).catch(() => {});
  };

  // Добавили в корзину: таблетка на мгновение показывает «Добавлено», затем
  // экран плавно уходит вниз обратно в меню (анимация обратная открытию).
  const handleAdd = () => {
    if (added) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddToCart(product);
    setAdded(true);
    Animated.timing(openAnim, {
      toValue: 0,
      duration: 300,
      delay: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) navigation.goBack();
    });
  };

  const openSheet = () => {
    Haptics.selectionAsync();
    setSheetMounted(true);
    Animated.timing(sheetAnim, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setSheetMounted(false);
    });
  };

  const goToCart = () => navigation.navigate('Tabs', { screen: 'CartTab' });

  const nutrition = product.nutrition;

  return (
    <Animated.View
      style={[
        styles.root,
        { opacity: openAnim, transform: [{ translateY: openAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: barTotal + spacing.xl }}>
        <View style={styles.hero}>
          <Animated.View style={{ transform: [{ scale: openAnim.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] }}>
            <ProductImage
              source={product.image}
              category={product.category}
              aspectRatio={1 / 1.05}
              borderRadius={0}
              contentFit={product.imageFit || 'contain'}
              contentPosition={product.imagePosition || 'center'}
              zoom={product.detailZoom || product.imageZoom || 1.08}
            />
          </Animated.View>
          {product.badge && <Badge type={product.badge} placement="hero" />}
        </View>

        <View style={[styles.body, { paddingHorizontal: hPad }]}>
          {!!kicker && <Text style={styles.kicker} numberOfLines={1}>{kicker}</Text>}
          <Text style={styles.name}>{displayName}</Text>

          {variants.length > 1 && (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Объём</Text>
              <View style={styles.variantCapsule}>
                {variants.map(variant => {
                  const selected = variant.id === product.id;
                  return (
                    <Pressable
                      key={variant.id}
                      onPress={() => { Haptics.selectionAsync(); setSelectedId(variant.id); }}
                      style={[styles.variantOption, selected && styles.variantOptionActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Объём ${variant.sizeLabel || 'стандартный'}, ${formatPrice(variant.price)}`}
                    >
                      <Text style={[styles.variantText, selected && styles.variantTextActive]}>{variant.sizeLabel || 'Стандарт'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* КБЖУ: значение крупно, подпись под ним. Показывается только там, где
              эти данные есть в СБИС. */}
          {nutrition && (
            <View style={styles.nutritionRow}>
              {[
                [formatNutrition(nutrition.calories, 'ккал'), 'энергия'],
                [formatNutrition(nutrition.protein, 'г'), 'белки'],
                [formatNutrition(nutrition.fat, 'г'), 'жиры'],
                [formatNutrition(nutrition.carbs, 'г'), 'углеводы'],
              ].map(([value, label]) => (
                <View key={label} style={styles.nutritionCell}>
                  <Text style={styles.nutritionValue} numberOfLines={1}>{value}</Text>
                  <Text style={styles.nutritionLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={openSheet}
            style={({ pressed }) => [styles.moreButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Подробнее о товаре"
          >
            <Text style={styles.moreText}>Подробнее</Text>
            <Ionicons name="chevron-up" size={16} color={colors.textPrimary} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Кнопки поверх фото: 44×44, не двигаются при прокрутке */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.roundButton, { top: insets.top + 8, left: hPad }]}
        accessibilityRole="button"
        accessibilityLabel="Назад"
      >
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleShare}
        style={[styles.roundButton, { top: insets.top + 8, right: hPad + 44 + spacing.sm }]}
        accessibilityRole="button"
        accessibilityLabel="Поделиться"
      >
        <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onToggleFavorite?.(product.id)}
        style={[styles.roundButton, { top: insets.top + 8, right: hPad }]}
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      >
        <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? colors.accent : colors.textPrimary} />
      </TouchableOpacity>

      {/* Плавающая панель: большая таблетка «+ цена». Когда товар уже в
          корзине, слева появляется капсула-степпер, а таблетка ведёт в корзину. */}
      <View style={[styles.actionBar, { left: hPad, right: hPad, bottom: barBottom }]}>
        {qty > 0 && !added && (
          <View style={styles.stepperCapsule}>
            <QuantityStepper qty={qty} onIncrement={() => onAddToCart(product)} onDecrement={() => onDecrement?.(cartKey(product.id))} />
          </View>
        )}
        <Pressable
          onPress={added ? undefined : qty > 0 ? goToCart : handleAdd}
          style={({ pressed }) => [styles.pill, pressed && { backgroundColor: colors.accentPressed }]}
          accessibilityRole="button"
          accessibilityLabel={qty > 0 ? `В корзину, ${formatPrice(price * qty)}` : `Добавить в корзину за ${formatPrice(price)}`}
        >
          {added ? (
            <>
              <Ionicons name="checkmark" size={24} color={colors.textOnDark} />
              <Text style={styles.pillText} numberOfLines={1}>Добавлено</Text>
            </>
          ) : qty > 0 ? (
            <Text style={styles.pillText} numberOfLines={1}>В корзину · {formatPrice(price * qty)}</Text>
          ) : (
            <>
              <Ionicons name="add" size={24} color={colors.textOnDark} />
              <Text style={styles.pillText} numberOfLines={1}>{formatPrice(price)}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Шторка «Подробнее»: затемнение + панель, выезжающая снизу вверх */}
      {sheetMounted && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.backdrop, { opacity: sheetAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityRole="button" accessibilityLabel="Закрыть" />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: sheetMaxHeight,
                paddingHorizontal: hPad,
                paddingBottom: insets.bottom + spacing.lg,
                transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [sheetMaxHeight, 0] }) }],
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={2}>{displayName}</Text>
              <TouchableOpacity onPress={closeSheet} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Закрыть">
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!!product.description ? (
                <Text style={styles.sheetText}>{product.description}</Text>
              ) : (
                <Text style={[styles.sheetText, { color: colors.textMuted }]}>Описание для этой позиции пока не добавлено.</Text>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: radius.xlarge,
    borderBottomRightRadius: radius.xlarge,
  },
  roundButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.level1,
  },

  body: { paddingTop: spacing.xl },
  kicker: { fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: colors.textSecondary },
  name: { ...typography.hero, fontSize: 27, color: colors.textPrimary, fontWeight: '700', marginTop: 6, marginBottom: 14 },

  block: { marginBottom: spacing.lg },
  blockLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },

  // Выбор объёма: капсула, выбранный вариант — белая «поднятая» таблетка.
  variantCapsule: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,12,12,0.06)',
  },
  variantOption: {
    minWidth: 76,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantOptionActive: { backgroundColor: colors.surface2, ...shadow.level2 },
  variantText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  variantTextActive: { fontWeight: '700', color: colors.textPrimary },

  // КБЖУ: четыре равные колонки, значение крупно, подпись мелко под ним.
  nutritionRow: { flexDirection: 'row', marginBottom: spacing.lg },
  nutritionCell: { flex: 1, alignItems: 'center' },
  nutritionValue: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
  nutritionLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  moreButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  actionBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.level3,
  },
  stepperCapsule: {
    height: 56,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,12,12,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    ...shadow.button,
  },
  pillText: { ...typography.cardTitle, fontSize: 17, fontWeight: '700', color: colors.textOnDark },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,12,12,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    borderTopLeftRadius: radius.xlarge,
    borderTopRightRadius: radius.xlarge,
    backgroundColor: colors.surface2,
    ...shadow.level3,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(12,12,12,0.15)', marginBottom: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  sheetTitle: { ...typography.sectionTitle, flex: 1, color: colors.textPrimary },
  sheetClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(12,12,12,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetText: { ...typography.body, lineHeight: 22.5, color: colors.textSecondary },
});
