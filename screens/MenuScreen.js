import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, Image, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QuickProductCard from '../components/QuickProductCard';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import Chip from '../components/Chip';
import { colors, spacing, radius, getHorizontalPadding } from '../theme/tokens';
import { cartKey } from '../data/products';
import { buildCategoryList, buildSubcategoryList } from '../lib/catalogService';

// ─────────────────────────────────────────────────────────────────────────
// Архитектура экрана (после переработки навигации):
//
//   ┌ Header (чёрный, фиксированный, НЕ часть скролла) ─────────────────┐
//   │  ○ поиск        SBL · SBL COFFEE                                  │
//   ├ Category bar (светлый, фиксированный, НЕ часть скролла) ──────────┤
//   │  [Все] [Напитки] [Еда] [Десерты]                                  │
//   ├ FlatList (единственный скролл на весь экран) ─────────────────────┤
//   │  НАПИТКИ                                                          │
//   │  [Все] [Кофе] [Авторский кофе] [Матча] ...  ← локальный фильтр    │
//   │  Кофе                                                             │
//   │  [карточка] [карточка]                                            │
//   │  ...                                                              │
//   │  ЕДА                                                              │
//   │  ...                                                              │
//   │  ДЕСЕРТЫ                                                          │
//   │  ...                                                              │
//   └────────────────────────────────────────────────────────────────────┘
//
// Header и category bar — обычные соседние View ДО FlatList в дереве, а не
// stickyHeaderIndices и не absolute-позиционирование поверх списка. Поэтому:
//   1. Им физически некуда "заехать" — весь остальной контент рендерится
//      строго ниже них, конфликтов z-index/наложения быть не может.
//   2. FlatList начинается сразу под ними, так что scrollToIndex(0, viewPosition: 0)
//      кладёт секцию ровно в видимую область — не нужно вычитать высоту
//      шапки/навигации из смещения.
// Ровно это было причиной прошлых багов (шапка "уезжала" при использовании
// stickyHeaderIndices, категории "выглядывали" из-под неё при попытке
// наложения) — теперь такой класс багов исключён самой структурой дерева.
//
// Двухуровневая навигация:
//   - activeCategory (главные категории вверху) — это НЕ фильтр, а навигация
//     по всему списку: тап скроллит к разделу, ручной скролл через
//     onViewableItemsChanged подсвечивает раздел, в котором сейчас viewport
//     ("scroll-spy"). Список остаётся один сплошной — ничего не скрывается.
//   - subFilters (чипы под названием раздела) — это ЛОКАЛЬНЫЙ фильтр внутри
//     одного конкретного раздела (Напитки/Еда/Десерты). Он меняет только то,
//     какие товары видны в ЭТОМ разделе, остальные разделы не трогает и не
//     превращает экран в отдельный "фильтрованный" список.
// ─────────────────────────────────────────────────────────────────────────

const SEARCH_CIRCLE_SIZE = 40;
const MAIN_CHIP_ROW_HEIGHT = 56;

// Верхняя строка навигации — "Все / Напитки / Еда / Десерты". Отдельный
// компонент, чтобы держать собственный ref горизонтального списка и плавно
// подскраливать активный чип в видимую область, когда активная категория
// меняется не от тапа по этому ряду, а от ручного scroll-spy.
function MainCategoryBar({ chips, activeId, onSelect, hPad }) {
  const listRef = useRef(null);

  useEffect(() => {
    const index = chips.findIndex(item => item.id === activeId);
    if (index >= 0) {
      listRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0.5 });
    }
  }, [activeId, chips]);

  return (
    <View style={styles.categoryBar}>
      <FlatList
        ref={listRef}
        horizontal
        data={chips}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: hPad, paddingRight: hPad + 16, alignItems: 'center' }}
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
        style={{ height: MAIN_CHIP_ROW_HEIGHT }}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0.5 }), 80);
        }}
        renderItem={({ item }) => (
          <Chip variant="main" label={item.label} active={activeId === item.id} onPress={() => onSelect(item.id)} />
        )}
      />
    </View>
  );
}

// Строка под-категорий внутри одного раздела — второй, менее выразительный
// уровень навигации (см. Chip small=true). Фильтрует только товары текущего
// раздела, к остальному меню отношения не имеет.
function SubcategoryChips({ subcats, activeSub, onSelect, hPad }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: hPad, alignItems: 'center', gap: spacing.xs }}
      style={styles.subchipRow}
    >
      <Chip small label="Все" active={activeSub === 'all'} onPress={() => onSelect('all')} />
      {subcats.map(subcat => (
        <Chip key={subcat} small label={subcat} active={activeSub === subcat} onPress={() => onSelect(subcat)} />
      ))}
    </ScrollView>
  );
}

export default function MenuScreen({ route, navigation, cart = {}, products = [], onAddToCart, onDecrement, onToggleFavorite, favoriteIds = [], tabBarHeight }) {
  // Разделы — понятные покупателю категории (Напитки/Еда/Десерты/Магазин),
  // размечены вручную поверх технических папок СБИС (см. lib/catalogService.js
  // и products-menu-taxonomy.sql).
  const mainCategories = useMemo(() => buildCategoryList(products), [products]);
  const mainChips = useMemo(
    () => [{ id: 'all', label: 'Все' }, ...mainCategories.map(id => ({ id, label: id }))],
    [mainCategories]
  );

  // activeCategory — подсветка текущего раздела вверху (навигация/scroll-spy,
  // не фильтр). subFilters — локальный фильтр под-категории на каждый
  // раздел отдельно, например { 'Напитки': 'Кофе' }; отсутствие ключа или
  // значение 'all' означает "показать все под-категории этого раздела".
  const [activeCategory, setActiveCategory] = useState('all');
  const [subFilters, setSubFilters] = useState({});
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hPad = getHorizontalPadding(width);
  const columnGap = spacing.md;
  const cardWidth = (width - hPad * 2 - columnGap) / 2;

  const mainListRef = useRef(null);

  const toggleSearch = () => {
    setSearchOpen(prev => {
      const next = !prev;
      if (!next) setQuery('');
      return next;
    });
  };

  useEffect(() => {
    if (searchOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus?.(), 50);
      return () => clearTimeout(timer);
    }
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLowerCase();

  const setSubFilter = (mainCategoryId, subId) => {
    setSubFilters(prev => ({ ...prev, [mainCategoryId]: subId }));
  };

  const listData = useMemo(() => {
    const rows = [];

    mainCategories.forEach(mainCat => {
      const itemsInCategory = products.filter(product => {
        if (product.menuCategory !== mainCat) return false;
        if (!normalizedQuery) return true;
        return (
          product.name.toLowerCase().includes(normalizedQuery) ||
          (product.description || '').toLowerCase().includes(normalizedQuery)
        );
      });
      if (!itemsInCategory.length) return;

      const subcats = buildSubcategoryList(products, mainCat);
      // Пока идёт поиск, локальный фильтр под-категории временно не
      // применяется — иначе результат поиска мог бы "спрятаться" за
      // выбранной ранее под-категорией, которую пользователь уже забыл, что
      // выбирал.
      const activeSub = normalizedQuery ? 'all' : (subFilters[mainCat] || 'all');

      rows.push({
        type: 'mainHeader',
        key: `main-${mainCat}`,
        groupId: mainCat,
        label: mainCat,
        count: itemsInCategory.length,
      });

      if (subcats.length > 1) {
        rows.push({
          type: 'subchips',
          key: `subchips-${mainCat}`,
          groupId: mainCat,
          subcats,
          activeSub,
        });
      }

      const pushProductRows = (items, subKey) => {
        for (let i = 0; i < items.length; i += 2) {
          rows.push({
            type: 'row',
            key: `row-${mainCat}-${subKey}-${i}`,
            items: [items[i], items[i + 1]],
            groupId: mainCat,
          });
        }
      };

      if (activeSub === 'all') {
        // Полный обзор раздела: товары сгруппированы по под-категориям, у
        // каждой — маленькая серая подпись, чтобы иерархия читалась даже
        // когда никакой чип не нажат. Если под-категория всего одна —
        // подпись не нужна, она дублировала бы название самого раздела.
        subcats.forEach(subcat => {
          const subItems = itemsInCategory.filter(p => (p.menuSubcategory || mainCat) === subcat);
          if (!subItems.length) return;
          if (subcats.length > 1) {
            rows.push({ type: 'subheader', key: `subheader-${mainCat}-${subcat}`, groupId: mainCat, label: subcat });
          }
          pushProductRows(subItems, subcat);
        });
      } else {
        // Выбрана конкретная под-категория — показываем только её товары,
        // без повторной подписи (сам активный чип уже её называет).
        const subItems = itemsInCategory.filter(p => (p.menuSubcategory || mainCat) === activeSub);
        pushProductRows(subItems, activeSub);
      }
    });

    return rows;
  }, [normalizedQuery, products, mainCategories, subFilters]);

  // Тап по главной категории — прокрутка к её началу, ничего не скрывает и
  // не фильтрует остальной список.
  const jumpToCategory = (id) => {
    setActiveCategory(id);
    if (id === 'all') {
      mainListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      return;
    }
    const index = listData.findIndex(row => row.type === 'mainHeader' && row.groupId === id);
    if (index >= 0) {
      mainListRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0 });
    }
  };

  // scroll-spy: пока пользователь листает список руками, верхний ряд сам
  // подсвечивает раздел, который сейчас на экране — берём раздел первой
  // видимой строки. minimumViewTime защищает от дёрганья на границе секций.
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 1, minimumViewTime: 120 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    const firstReal = viewableItems.find(v => v.item?.groupId);
    if (firstReal) setActiveCategory(prev => (prev === firstReal.item.groupId ? prev : firstReal.item.groupId));
  });

  useEffect(() => {
    const targetCategory = route?.params?.category;
    if (targetCategory && mainChips.some(item => item.id === targetCategory)) {
      const timer = setTimeout(() => jumpToCategory(targetCategory), 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.category, mainChips]);

  const goProduct = (product) => navigation.navigate('Product', { product });
  const defaultQty = (productId) => cart[cartKey(productId)]?.qty || 0;
  const incrementDefault = (product) => onAddToCart(product);
  const decrementDefault = (productId) => onDecrement?.(cartKey(productId));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header — фиксированная чёрная шторка, не часть скролла. Круглая
          кнопка поиска слева (16px от края), бренд по центру. */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerSide}>
          <TouchableOpacity
            onPress={toggleSearch}
            style={styles.searchCircle}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Закрыть поиск' : 'Открыть поиск'}
            hitSlop={6}
          >
            <Ionicons name={searchOpen ? 'close' : 'search'} size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>
        <View style={styles.brandRow}>
          <Image source={require('../assets/logo-mark.png')} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.brandText}>SBL COFFEE</Text>
        </View>
        <View style={styles.headerSide} />
      </View>

      {searchOpen && (
        <View style={[styles.searchBox, { marginHorizontal: hPad, marginTop: spacing.md }]}>
          <Ionicons name="search-outline" size={17} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
          <TextInput
            ref={searchInputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск напитков и блюд"
            returnKeyType="search"
            style={styles.searchInput}
            placeholderTextColor={colors.textMuted}
          />
          {query !== '' && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Очистить поиск">
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Category bar — фиксированный ряд главных категорий, не часть
          скролла, отдельно от header (не наложен и не перекрыт им). */}
      <MainCategoryBar chips={mainChips} activeId={activeCategory} onSelect={jumpToCategory} hPad={hPad} />

      <FlatList
        ref={mainListRef}
        data={listData}
        keyExtractor={item => item.key}
        viewabilityConfig={viewabilityConfigRef.current}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl, paddingTop: spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={({ index }) => {
          // Пока список не измерил все строки (карточки с фото грузятся
          // асинхронно), scrollToIndex может не попасть с первого раза —
          // пробуем ещё раз чуть позже.
          setTimeout(() => mainListRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0 }), 120);
        }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: hPad, paddingTop: spacing.xl }}>
            <EmptyState
              icon={products.length ? 'search-outline' : 'cafe-outline'}
              title={products.length ? 'Ничего не найдено' : 'Меню загружается'}
              subtitle={
                !products.length
                  ? 'Если меню долго не появляется — проверьте подключение к интернету.'
                  : query ? `По запросу «${query}» ничего нет` : 'В этой категории пока пусто'
              }
              action={products.length ? <PrimaryButton label="Сбросить поиск" onPress={() => setQuery('')} /> : undefined}
            />
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'mainHeader') {
            return (
              <View style={[styles.mainHeaderRow, { paddingHorizontal: hPad }]}>
                <Text style={styles.mainHeaderTitle}>{item.label}</Text>
                <Text style={styles.mainHeaderCount}>
                  {item.count} {item.count === 1 ? 'позиция' : item.count < 5 ? 'позиции' : 'позиций'}
                </Text>
              </View>
            );
          }
          if (item.type === 'subchips') {
            return (
              <SubcategoryChips
                subcats={item.subcats}
                activeSub={item.activeSub}
                onSelect={(subId) => setSubFilter(item.groupId, subId)}
                hPad={hPad}
              />
            );
          }
          if (item.type === 'subheader') {
            return (
              <View style={{ paddingHorizontal: hPad }}>
                <Text style={styles.subsectionTitle}>{item.label}</Text>
              </View>
            );
          }
          return (
            <View style={[styles.gridRow, { paddingHorizontal: hPad, gap: columnGap }]}>
              <QuickProductCard
                product={item.items[0]}
                width={cardWidth}
                onPress={goProduct}
                onAdd={onAddToCart}
                qty={defaultQty(item.items[0].id)}
                onIncrement={() => incrementDefault(item.items[0])}
                onDecrement={() => decrementDefault(item.items[0].id)}
                isFavorite={favoriteIds.includes(item.items[0].id)}
                onToggleFavorite={onToggleFavorite}
              />
              {item.items[1] ? (
                <QuickProductCard
                  product={item.items[1]}
                  width={cardWidth}
                  onPress={goProduct}
                  onAdd={onAddToCart}
                  qty={defaultQty(item.items[1].id)}
                  onIncrement={() => incrementDefault(item.items[1])}
                  onDecrement={() => decrementDefault(item.items[1].id)}
                  isFavorite={favoriteIds.includes(item.items[1].id)}
                  onToggleFavorite={onToggleFavorite}
                />
              ) : (
                <View style={{ width: cardWidth }} />
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerSide: {
    width: SEARCH_CIRCLE_SIZE,
    alignItems: 'flex-start',
  },
  searchCircle: {
    width: SEARCH_CIRCLE_SIZE,
    height: SEARCH_CIRCLE_SIZE,
    borderRadius: SEARCH_CIRCLE_SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  brandLogo: {
    width: 24,
    height: 24,
    tintColor: '#fff',
  },
  brandText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textOnDark,
  },
  searchBox: {
    backgroundColor: colors.surface1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  categoryBar: {
    backgroundColor: colors.surface1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subchipRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  mainHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  mainHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  mainHeaderCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
});
