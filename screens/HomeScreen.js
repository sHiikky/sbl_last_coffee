import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppScreen from '../components/AppScreen';
import HoloLine from '../components/HoloLine';
import HoloRing from '../components/HoloRing';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import HorizontalProductSection from '../components/HorizontalProductSection';
import HomeLoyaltyCard from '../components/HomeLoyaltyCard';
import LoyaltyHomeWidget from '../components/loyalty/LoyaltyHomeWidget';
import ActiveOrderBanner from '../components/home/ActiveOrderBanner';
import PromoBanner from '../components/home/PromoBanner';
import { colors, spacing, radius, shadow, typography, getHorizontalPadding, brand } from '../theme/tokens';
import { cartKey, getProductById } from '../data/products';
import { buildCategoryList } from '../lib/catalogService';
import useBonusAccount from '../hooks/useBonusAccount';
import { getLevelProgress } from '../lib/bonusConfig';
import { getActivePromoBanner } from '../lib/promoService';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return { title: 'Кофе уже ждёт' };
  if (h < 12) return { title: 'Начнём день с блеска' };
  if (h < 18) return { title: 'Новое зерно уже ждёт вас' };
  return { title: 'Время притормозить и выпить кофе' };
}

function HomeCategoryNav({ categories, hPad, onSelectCategory }) {
  return (
    <View style={[styles.homeNav, { paddingHorizontal: hPad }]}>
      {categories.map(item => {
        const active = item.id === 'forYou';
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelectCategory(item)}
            hitSlop={8}
            style={styles.homeNavItem}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.homeNavText, active && styles.homeNavTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function HomeScreen({ navigation, cart = {}, products = [], onAddToCart, onDecrement, onToggleFavorite, favoriteIds = [], tabBarHeight, loyaltyState, activeOrder, onOpenActiveOrder, onActiveOrderFinished }) {
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const g = greeting();
  const bonusAccount = useBonusAccount();
  const { level: bonusLevel, toNextLevel: bonusToNextLevel, progress: bonusProgress } = getLevelProgress(bonusAccount.lifetimePaid);

  const [activePromo, setActivePromo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getActivePromoBanner().then(promo => { if (!cancelled) setActivePromo(promo); });
    return () => { cancelled = true; };
  }, []);
  const goPromo = () => {
    const product = activePromo?.product_id ? getProductById(products, activePromo.product_id) : null;
    if (product) navigation.navigate('Product', { product });
    else navigation.navigate('MenuTab');
  };

  // Разделы меню — реальные категории СБИС, а не захардкоженный список.
  const homeCategories = useMemo(() => {
    const ids = buildCategoryList(products);
    return [{ id: 'forYou', label: 'Для вас' }, ...ids.map(id => ({ id, label: id, targetCategory: id }))];
  }, [products]);

  // "Быстрый выбор" — пока ни один товар вручную не отмечен is_quick_pick в
  // Supabase (см. schema), показываем первые товары из меню как разумную
  // заглушку, а не пустой экран.
  const quickPicks = useMemo(() => {
    const marked = products.filter(p => p.isQuickPick);
    return marked.length ? marked : products.slice(0, 8);
  }, [products]);
  const favoriteProducts = products.filter(product => favoriteIds.includes(product.id)).slice(0, 4);

  const goProduct = (product) => navigation.navigate('Product', { product });
  const defaultQty = (productId) => cart[cartKey(productId)]?.qty || 0;
  const decrementDefault = (productId) => onDecrement?.(cartKey(productId));
  const goMenu = (category = 'all') => navigation.navigate('MenuTab', { category });
  const selectHomeCategory = (item) => {
    if (item.id === 'forYou') return;
    goMenu(item.targetCategory);
  };

  return (
    <AppScreen bottomInset={tabBarHeight}>
      <View style={[styles.logoRow, { paddingHorizontal: hPad }]}>
        <Image source={require('../assets/logo-mark.png')} style={styles.logo} resizeMode="contain" />
        <TouchableOpacity onPress={() => navigation.navigate('ProfileTab')} accessibilityRole="button" accessibilityLabel="Открыть профиль">
          <HoloRing size={46}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>АИ</Text>
          </HoloRing>
        </TouchableOpacity>
      </View>

      <View style={[styles.headerRow, { paddingHorizontal: hPad }]}>
        <Text style={[typography.sectionTitle, { color: colors.textPrimary, lineHeight: 26 }]} numberOfLines={2}>{g.title}</Text>
      </View>

      {activeOrder?.id && (
        <View style={{ marginHorizontal: hPad, marginBottom: spacing.md }}>
          <ActiveOrderBanner
            activeOrder={activeOrder}
            onPress={onOpenActiveOrder}
            onFinished={onActiveOrderFinished}
          />
        </View>
      )}

      {activePromo && (
        <View style={{ marginHorizontal: hPad, marginBottom: spacing.md }}>
          <PromoBanner promo={activePromo} onPress={goPromo} />
        </View>
      )}

      <View style={{ height: spacing.md }} />
      <HoloLine marginHorizontal={hPad} height={5} />

      <View style={{ height: spacing.xl }} />
      <HomeCategoryNav categories={homeCategories} hPad={hPad} onSelectCategory={selectHomeCategory} />

      <View style={{ marginHorizontal: hPad, marginTop: spacing.lg }}>
        <HomeLoyaltyCard
          bonuses={bonusAccount.balance}
          rate={bonusLevel.rate}
          level={bonusLevel.level}
          toNextLevel={bonusToNextLevel}
          progress={bonusProgress}
          onPressInfo={() => navigation.navigate('Loyalty')}
        />
      </View>

      <View style={{ marginHorizontal: hPad, marginTop: spacing.md }}>
        <LoyaltyHomeWidget loyaltyState={loyaltyState} onPress={() => navigation.navigate('Loyalty')} />
      </View>

      <HorizontalProductSection
        title="Быстрый выбор"
        products={quickPicks.slice(0, 8)}
        hPad={hPad}
        onAction={() => goMenu('all')}
        onOpenProduct={goProduct}
        onAddProduct={onAddToCart}
        getQty={defaultQty}
        onIncrementProduct={onAddToCart}
        onDecrementProduct={decrementDefault}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
      />

      <View style={[styles.editorial, { marginHorizontal: hPad }, shadow.card]}>
        <HoloLine marginHorizontal={0} height={3} style={{ marginBottom: 0 }} />
        <View style={styles.editorialBody}>
          <View style={{ flex: 1 }}>
            <Text style={styles.editorialEyebrow}>Сегодня в {brand.name}</Text>
            <Text style={styles.editorialTitle}>Новое зерно из Эфиопии</Text>
            <Text style={styles.editorialSub}>Цветочные ноты, персик и жасмин — для напитков с блеском.</Text>
          </View>
          <View style={styles.editorialObject}>
            <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
          </View>
        </View>
      </View>

      <View style={{ marginTop: spacing.xxl }}>
        <View style={styles.sectionHeader}>
          <Text style={[typography.eyebrow, { color: colors.textMuted }]}>Избранное</Text>
        </View>

        {favoriteProducts.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: spacing.md, gap: spacing.md }}>
            {favoriteProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                width={170}
                onPress={goProduct}
                onAdd={onAddToCart}
                isFavorite={favoriteIds.includes(product.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={{ marginHorizontal: hPad }}>
            <EmptyState
              icon="heart-outline"
              title="Соберите своё избранное"
              subtitle="Добавляйте напитки в избранное, чтобы они оставались под рукой на главном экране."
              action={<PrimaryButton label="Открыть меню" onPress={goMenu} />}
            />
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  logo: { width: 64, height: 30 },
  headerRow: { flexDirection: 'row' },
  homeNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 },
  homeNavItem: { alignItems: 'center', justifyContent: 'center', minWidth: 54 },
  homeNavText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  homeNavTextActive: { color: colors.textPrimary, fontWeight: '600' },
  editorial: { marginTop: spacing.xl, backgroundColor: colors.surface3, borderRadius: radius.large, overflow: 'hidden' },
  editorialBody: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  editorialEyebrow: { fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', marginBottom: 7, fontWeight: '700' },
  editorialTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 3 },
  editorialSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  editorialObject: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: spacing.lg },
  sectionLink: { fontSize: 12, fontWeight: '600', color: colors.accent },
});
