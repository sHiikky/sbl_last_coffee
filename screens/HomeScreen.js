import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import Text from '../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import AppScreen from '../components/AppScreen';
import HoloLine from '../components/HoloLine';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import HorizontalProductSection from '../components/HorizontalProductSection';
import HomeLoyaltyCard from '../components/HomeLoyaltyCard';
import LoyaltyHomeWidget from '../components/loyalty/LoyaltyHomeWidget';
import ActiveOrderBanner from '../components/home/ActiveOrderBanner';
import PromoBanner from '../components/home/PromoBanner';
import HomePublications from '../components/home/HomePublications';
import { colors, spacing, radius, typography, getHorizontalPadding } from '../theme/tokens';
import { cartKey, getProductById } from '../data/products';
import useBonusAccount from '../hooks/useBonusAccount';
import { getLevelProgress } from '../lib/bonusConfig';
import { getActivePromoBanner } from '../lib/promoService';
import useCafeHours from '../hooks/useCafeHours';
import BrandLogo from '../components/BrandLogo';

const LOGO_WIDTH = 88;
const LOGO_HEIGHT = LOGO_WIDTH * (452 / 1554);

export default function HomeScreen({ navigation, cart = {}, products = [], catalogLoading = false, catalogError = null, onRetryCatalog, onAddToCart, onDecrement, onToggleFavorite, favoriteIds = [], tabBarHeight, loyaltyState, activeOrder, onOpenActiveOrder, onActiveOrderFinished }) {
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const hours = useCafeHours();
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

  return (
    <AppScreen bottomInset={tabBarHeight}>
      <View style={[styles.logoRow, { paddingHorizontal: hPad, paddingTop: hPad }]}>
        <BrandLogo width={LOGO_WIDTH} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Кофейня: ежедневно ${hours.hoursLabel} по Томску. ${hours.statusLabel}. Открыть карту и адрес`} onPress={() => navigation.navigate('CafeLocation')} style={({ pressed }) => [styles.hoursBadge, pressed && styles.hoursPressed]}>
          <View style={styles.hoursLine}><Ionicons name="time-outline" size={15} color={colors.textPrimary} /><Text style={styles.hoursTime}>{hours.hoursLabel}</Text><Ionicons name="chevron-forward" size={13} color={colors.textSecondary} /></View>
          <View style={styles.hoursLine}><View style={[styles.hoursDot, { backgroundColor: hours.physicallyOpen ? colors.success : colors.textMuted }]} /><Text style={styles.hoursStatus}>{hours.statusLabel} · Томск</Text></View>
        </Pressable>
      </View>

      <View style={[styles.headerRow, { paddingHorizontal: hPad }]}>
        <Text style={[typography.sectionTitle, { color: colors.textPrimary, lineHeight: 26 }]} numberOfLines={2}>{hours.greeting}</Text>
      </View>

      {!!catalogError && <View style={[styles.catalogNotice, { marginHorizontal: hPad }]}>
        <View style={{ flex: 1 }}><Text style={styles.catalogNoticeTitle}>{products.length ? 'Показываем последнее меню' : 'Меню не обновилось'}</Text><Text style={styles.catalogNoticeCopy}>Проверьте подключение и повторите загрузку.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Обновить меню" accessibilityState={{ disabled: catalogLoading, busy: catalogLoading }} disabled={catalogLoading} onPress={onRetryCatalog} style={styles.catalogRetry}><Text style={styles.catalogRetryText}>{catalogLoading ? 'Обновляем…' : 'Повторить'}</Text></Pressable>
      </View>}

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

      <View style={{ marginHorizontal: hPad, marginTop: spacing.xl }}>
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

      <HomePublications hPad={hPad} products={products} onOpenProduct={goProduct} />

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
  hoursBadge: { minHeight: 48, borderRadius: radius.medium, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface1, gap: spacing.xs },
  hoursPressed: { opacity: 0.75 },
  hoursLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  hoursTime: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  hoursStatus: { color: colors.textSecondary, fontSize: 12 },
  hoursDot: { width: 5, height: 5, borderRadius: radius.pill },
  catalogNotice: { marginTop: spacing.md, paddingLeft: spacing.md, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface1, borderRadius: radius.medium },
  catalogNoticeTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  catalogNoticeCopy: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  catalogRetry: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  catalogRetryText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  // У PNG прозрачные поля (слева 74 из 1233 px, сверху 35 из 584 px), поэтому
  // отрицательные отступы выравнивают именно видимые края логотипа по сетке:
  // слева и сверху от safe area получается ровно hPad.
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    marginLeft: -LOGO_WIDTH * (74 / 1233),
    marginTop: -LOGO_HEIGHT * (35 / 584),
  },
  headerRow: { flexDirection: 'row' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: spacing.lg },
  sectionLink: { fontSize: 12, fontWeight: '600', color: colors.accent },
});
