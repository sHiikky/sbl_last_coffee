import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import ProductImage from '../components/ProductImage';
import PrimaryButton from '../components/PrimaryButton';
import Badge from '../components/Badge';
import { colors, spacing, radius, typography } from '../theme/tokens';
import { formatPrice } from '../data/products';
import { splitNameAndSize } from '../lib/catalogService';
import useBonusAccount from '../hooks/useBonusAccount';
import { getBonusLevel } from '../lib/bonusConfig';

// Раньше здесь был выбор размера/молока/температуры/добавок — в реальном
// меню СБИС у каждого такого варианта уже отдельная позиция со своей ценой
// (например, "Чай 500 мл" — сам по себе товар), поэтому экран просто
// показывает товар и добавляет его в корзину как есть, без надбавок сверху.
export default function ProductScreen({ route, navigation, onAddToCart, onToggleFavorite, favoriteIds = [] }) {
  const { product } = route.params;
  const insets = useSafeAreaInsets();
  const [added, setAdded] = useState(false);
  const addTimerRef = useRef(null);
  const openAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(openAnim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [openAnim]);

  const price = product.price;
  const { displayName, sizeLabel } = product.displayName
    ? { displayName: product.displayName, sizeLabel: product.sizeLabel }
    : splitNameAndSize(product.name);
  const bonusAccount = useBonusAccount();
  // Оценка для UI — как и в CartScreen, реальное начисление и уровень
  // считает бэкенд-триггер только при completed (см. миграцию бонусов).
  const earnedBonuses = Math.floor(price * getBonusLevel(bonusAccount.lifetimePaid).rate);
  const isFavorite = favoriteIds.includes(product.id);

  useEffect(() => () => {
    if (addTimerRef.current) clearTimeout(addTimerRef.current);
  }, []);

  const handleShare = () => {
    Share.share({ message: `${product.name} — ${formatPrice(price)} · SBL` }).catch(() => {});
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAdded(true);
    addTimerRef.current = setTimeout(() => {
      onAddToCart(product);
      navigation.goBack();
    }, 300);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: openAnim,
          transform: [
            { scale: openAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            { translateY: openAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        }}
      >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View>
          <ProductImage
            source={product.image}
            category={product.category}
            aspectRatio={4 / 3}
            borderRadius={0}
            contentFit={product.imageFit || 'contain'}
            contentPosition={product.imagePosition || 'center'}
            zoom={product.detailZoom || product.imageZoom || 1.08}
          />
          {product.badge && <Badge type={product.badge} />}

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.topButton, { top: insets.top + 12, left: 18 }]}
            accessibilityRole="button"
            accessibilityLabel="Назад"
          >
            <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShare}
            style={[styles.topButton, { top: insets.top + 12, right: 66 }]}
            accessibilityRole="button"
            accessibilityLabel="Поделиться"
          >
            <Ionicons name="share-outline" size={17} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onToggleFavorite?.(product.id)}
            style={[styles.topButton, { top: insets.top + 12, right: 18 }]}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={18} color={isFavorite ? colors.accent : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 5, backgroundColor: colors.accent }} />

        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
          <Text style={styles.eyebrow}>SBL · {product.category}{sizeLabel ? ` · ${sizeLabel}` : ''}</Text>
          <Text style={[typography.hero, { fontSize: 27, color: colors.textPrimary, textAlign: 'center', fontWeight: '700' }]}>{displayName}</Text>
          {!!product.description && (
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 }]}>{product.description}</Text>
          )}

          <View style={styles.metaCard}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Готовность</Text>
              <Text style={styles.metaValue}>10–15 мин</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Бонусы</Text>
              <Text style={styles.metaValue}>+{earnedBonuses}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Формат</Text>
              <Text style={styles.metaValue}>Самовывоз</Text>
            </View>
          </View>

          <View style={{ height: spacing.section }} />

          <View style={styles.footer}>
            <View>
              <Text style={styles.priceLabel}>Цена</Text>
              <Text style={styles.priceValue}>{formatPrice(price)}</Text>
              <Text style={styles.bonusHint}>После покупки начислим {earnedBonuses} бонусов</Text>
            </View>
            <PrimaryButton label={added ? '✓ Добавлено' : 'В корзину'} onPress={handleAdd} disabled={added} haptic="light" />
          </View>
        </View>
      </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  topButton: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.xs },
  metaCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaCell: { flex: 1 },
  metaDivider: { width: 1, height: 30, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  metaLabel: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.textMuted, marginBottom: 4 },
  metaValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.xs },
  priceValue: { fontSize: 32, fontWeight: '700', color: colors.textPrimary },
  bonusHint: { fontSize: 11, color: colors.textSecondary, marginTop: 4, maxWidth: 180 },
});
