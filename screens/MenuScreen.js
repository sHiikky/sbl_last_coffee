import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// АРХИТЕКТУРА SCROLL NAVIGATION
//
// Header и category bar — обычные соседние View ДО FlatList (не sticky
// overlay, не stickyHeaderIndices). Список начинается физически ниже них,
// поэтому scrollToIndex/scrollToOffset никогда не должны компенсировать
// высоту шапки — в отличие от оверлейных sticky-баров, тут этой категории
// багов просто не существует по конструкции.
//
// Единственный источник истины для activeCategory — navigationModeRef,
// простая state machine с тремя режимами:
//
//   'idle'                 — пользователь листает сам. Scroll-spy имеет право
//                             определять активную категорию.
//   'programmatic-scroll'  — сработал тап по главной категории. activeCategory
//                             уже выставлен мгновенно; scroll-spy молчит, пока
//                             список не доедет (onMomentumScrollEnd) или не
//                             сработает страховочный таймаут.
//   'subcategory-relayout' — сработал тап по под-категории. activeCategory
//                             остаётся "приколотым" к текущему разделу, пока
//                             список не пересчитает layout под новый фильтр и
//                             не переякорится на заголовок раздела.
//
// Приоритет источников activeCategory (не наоборот!):
//   1. Явное намерение пользователя (тап по главной категории).
//   2. Текущий контекст релейаута (тап по под-категории).
//   3. Scroll-spy — только когда ничего из вышеперечисленного не идёт.
//
// programmaticSequenceRef — токен поколения: каждый новый тап увеличивает
// счётчик, и любой отложенный callback (setTimeout/rAF) от СТАРОГО тапа,
// сверив токен, просто ничего не делает. Это защищает от быстрых кликов
// "Напитки → Десерты → Еда", когда таймер от "Напитки" мог бы разблокировать
// spy посреди поездки к "Десертам".
//
// Критический баг короткой последней секции (после фильтра "Шу" в Десертах
// остаётся 3 товара) решён в два слоя:
//   - адаптивный нижний отступ (footerSpacerHeight, см. ниже) — старается
//     геометрически гарантировать, что заголовок последней секции физически
//     может доехать до верха списка, даже если под ним почти нет контента;
//   - near-bottom override в onScroll — независимая страховка: если пользователь
//     физически долистал до конца контента, активной считается ПОСЛЕДНЯЯ
//     большая категория, даже если оценка отступа выше оказалась неточной.
// Оценка высоты последней секции для отступа — приблизительная (по количеству
// строк и типовым размерам), не пиксель-точный measure — сознательный выбор:
// getting a pixel-perfect absolute offset from a plain FlatList row would
// require re-implementing getItemLayout for variable-height rows, что заметно
// более хрупко. Итоговую корректность обеспечивает near-bottom override, а
// не точность этой оценки.
// ─────────────────────────────────────────────────────────────────────────

const SEARCH_CIRCLE_SIZE = 38;
const HEADER_CONTENT_HEIGHT = 52;
const MAIN_CHIP_ROW_HEIGHT = 52;

// Типовые высоты строк списка — используются только для оценки высоты
// последней секции (footerSpacerHeight), не для реальной раскладки.
const EST_MAIN_HEADER_H = 54;
const EST_SUBCHIPS_H = 46;
const EST_SUBHEADER_H = 34;
const EST_EMPTY_ROW_H = 60;

const keyExtractorRow = (item) => item.key;

// Верхняя строка навигации — "Все / Напитки / Еда / Десерты". React.memo —
// чтобы не перерисовываться, когда меняется что-то не связанное с ней самой
// (например, открылось поле поиска).
const MainCategoryBar = React.memo(function MainCategoryBar({ chips, activeId, onSelect, hPad }) {
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
});

// Строка под-категорий внутри одного раздела — второй, менее выразительный
// уровень навигации. Фильтрует только товары текущего раздела.
const SubcategoryChips = React.memo(function SubcategoryChips({ subcats, activeSub, onSelect, hPad }) {
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
});

export default function MenuScreen({ route, navigation, cart = {}, products = [], onAddToCart, onDecrement, onToggleFavorite, favoriteIds = [], tabBarHeight }) {
  const mainCategories = useMemo(() => buildCategoryList(products), [products]);
  const mainChips = useMemo(
    () => [{ id: 'all', label: 'Все' }, ...mainCategories.map(id => ({ id, label: id }))],
    [mainCategories]
  );

  const [activeCategory, setActiveCategory] = useState('all');
  const [subFilters, setSubFilters] = useState({});
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const searchInputRef = useRef(null);
  const { width, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hPad = getHorizontalPadding(width);
  const columnGap = spacing.md;
  const cardWidth = (width - hPad * 2 - columnGap) / 2;

  const mainListRef = useRef(null);

  // ── Навигационная state machine: только refs, никакого React state на
  // каждый scroll-кадр (см. комментарий вверху файла). ────────────────────
  const navigationModeRef = useRef('idle'); // 'idle' | 'programmatic-scroll' | 'subcategory-relayout'
  const programmaticSequenceRef = useRef(0);
  const unlockTimeoutRef = useRef(null);
  const activeCategoryRef = useRef(activeCategory);
  const mainCategoriesRef = useRef(mainCategories);
  const listDataRef = useRef([]);
  const lastScrollYRef = useRef(0);
  const directionRef = useRef('down');
  const lastSpySwitchAtRef = useRef(0);

  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { mainCategoriesRef.current = mainCategories; }, [mainCategories]);
  useEffect(() => () => { if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current); }, []);

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

  const listData = useMemo(() => {
    // Зависит ТОЛЬКО от данных и фильтров — ни scrollY, ни activeCategory
    // сюда не примешиваются: позиция скролла не имеет отношения к тому,
    // какие товары показывать.
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
        subcats.forEach(subcat => {
          const subItems = itemsInCategory.filter(p => (p.menuSubcategory || mainCat) === subcat);
          if (!subItems.length) return;
          if (subcats.length > 1) {
            rows.push({ type: 'subheader', key: `subheader-${mainCat}-${subcat}`, groupId: mainCat, label: subcat });
          }
          pushProductRows(subItems, subcat);
        });
      } else {
        // Выбрана конкретная под-категория. Если в ней 0 товаров — не ломаем
        // геометрию секции пустотой без объяснения, показываем компактный
        // empty state. Главная категория при этом не меняется (см. приоритет
        // "explicit relayout context" выше выбора scroll-spy).
        const subItems = itemsInCategory.filter(p => (p.menuSubcategory || mainCat) === activeSub);
        if (subItems.length) {
          pushProductRows(subItems, activeSub);
        } else {
          rows.push({ type: 'sectionEmpty', key: `empty-${mainCat}-${activeSub}`, groupId: mainCat, label: 'В этой подкатегории пока нет позиций' });
        }
      }
    });

    return rows;
  }, [normalizedQuery, products, mainCategories, subFilters]);

  useEffect(() => { listDataRef.current = listData; }, [listData]);

  // ── Адаптивный нижний отступ: последняя большая секция должна физически
  // иметь возможность доехать своим заголовком до верха списка, даже если в
  // ней остался один товар после фильтра под-категории. См. комментарий
  // вверху файла про то, почему оценка приблизительная, а не measure. ─────
  const footerSpacerHeight = useMemo(() => {
    const base = tabBarHeight + spacing.xl;
    if (!mainCategories.length || !viewportHeight) return base;
    const lastCat = mainCategories[mainCategories.length - 1];
    let mainHeaderCount = 0;
    let subchipsCount = 0;
    let subheaderCount = 0;
    let rowCount = 0;
    let emptyCount = 0;
    listData.forEach(row => {
      if (row.groupId !== lastCat) return;
      if (row.type === 'mainHeader') mainHeaderCount += 1;
      else if (row.type === 'subchips') subchipsCount += 1;
      else if (row.type === 'subheader') subheaderCount += 1;
      else if (row.type === 'row') rowCount += 1;
      else if (row.type === 'sectionEmpty') emptyCount += 1;
    });
    const estimatedRowHeight = cardWidth / 1.15 + 108;
    const estimatedLastSectionHeight =
      mainHeaderCount * EST_MAIN_HEADER_H +
      subchipsCount * EST_SUBCHIPS_H +
      subheaderCount * EST_SUBHEADER_H +
      rowCount * estimatedRowHeight +
      emptyCount * EST_EMPTY_ROW_H;
    const needed = viewportHeight - estimatedLastSectionHeight + 24;
    return Math.max(base, needed);
  }, [listData, mainCategories, viewportHeight, cardWidth, tabBarHeight]);

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: footerSpacerHeight, paddingTop: spacing.md }),
    [footerSpacerHeight]
  );

  const onFlatListLayout = useCallback((e) => {
    setViewportHeight(e.nativeEvent.layout.height);
  }, []);

  // ── PRIORITY 1: явный тап по главной категории. Подсветка меняется
  // мгновенно, scroll-spy полностью блокируется до конца поездки. ────────
  const jumpToCategory = useCallback((id) => {
    programmaticSequenceRef.current += 1;
    const seq = programmaticSequenceRef.current;
    navigationModeRef.current = 'programmatic-scroll';
    setActiveCategory(id);

    if (id === 'all') {
      mainListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    } else {
      const index = listDataRef.current.findIndex(row => row.type === 'mainHeader' && row.groupId === id);
      if (index >= 0) {
        mainListRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0 });
      }
    }

    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
    // Страховочный таймаут — на случай, если onMomentumScrollEnd не придёт
    // (например, список уже был в нужном месте и momentum не запустился).
    unlockTimeoutRef.current = setTimeout(() => {
      if (seq !== programmaticSequenceRef.current) return; // устаревший вызов — уже другой тап
      navigationModeRef.current = 'idle';
    }, 800);
  }, []);

  // ── PRIORITY 2: тап по под-категории. Главная категория "приколота" к
  // текущему разделу и не пересчитывается заново — мы и так точно знаем,
  // какой это раздел. ─────────────────────────────────────────────────────
  const setSubFilter = useCallback((mainCategoryId, subId) => {
    programmaticSequenceRef.current += 1;
    const seq = programmaticSequenceRef.current;
    navigationModeRef.current = 'subcategory-relayout';
    setActiveCategory(mainCategoryId);
    setSubFilters(prev => ({ ...prev, [mainCategoryId]: subId }));

    // Двойной requestAnimationFrame — ждём, пока React закоммитит новый
    // layout после смены фильтра, прежде чем переякориться на заголовок
    // раздела. Не единственная защита: onScrollToIndexFailed на самом
    // FlatList — резервный вариант, если этого кадра не хватило.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (seq !== programmaticSequenceRef.current) return;
        const index = listDataRef.current.findIndex(row => row.type === 'mainHeader' && row.groupId === mainCategoryId);
        if (index >= 0) {
          // animated:false — пользователь уже находится в этом разделе, мы
          // всего лишь компенсируем изменение высоты секции, а не катаем его
          // по экрану заново.
          mainListRef.current?.scrollToIndex?.({ index, animated: false, viewPosition: 0 });
        }
        if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
        unlockTimeoutRef.current = setTimeout(() => {
          if (seq !== programmaticSequenceRef.current) return;
          navigationModeRef.current = 'idle';
        }, 150);
      });
    });
  }, []);

  const onScrollToIndexFailed = useCallback(({ index }) => {
    setTimeout(() => mainListRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0 }), 120);
  }, []);

  // ── Пользователь взял скролл в руки — программный режим немедленно
  // отменяется, приоритет всегда у живого жеста. ──────────────────────────
  const onScrollBeginDrag = useCallback(() => {
    if (navigationModeRef.current !== 'idle') {
      programmaticSequenceRef.current += 1;
      navigationModeRef.current = 'idle';
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
    }
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    if (navigationModeRef.current === 'programmatic-scroll') {
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
      navigationModeRef.current = 'idle';
    }
  }, []);

  // ── PRIORITY 3: scroll-spy — работает только в режиме idle. Помимо
  // обычной viewability-логики есть два дешёвых пограничных случая прямо в
  // onScroll: "почти в самом верху" -> Все, и "почти у самого низа" ->
  // последняя категория. Второй — прямая защита от бага короткой последней
  // секции (см. комментарий вверху файла): даже если оценка отступа неточна,
  // физическое приближение к концу контента однозначно означает, что
  // пользователь смотрит на последний раздел. ─────────────────────────────
  const onScroll = useCallback((e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    directionRef.current = y > lastScrollYRef.current ? 'down' : y < lastScrollYRef.current ? 'up' : directionRef.current;
    lastScrollYRef.current = y;

    if (navigationModeRef.current !== 'idle') return;

    const cats = mainCategoriesRef.current;
    if (!cats.length) return;

    if (y <= 24) {
      if (activeCategoryRef.current !== 'all') setActiveCategory('all');
      return;
    }

    const distanceFromBottom = contentSize.height - (y + layoutMeasurement.height);
    if (distanceFromBottom < 32) {
      const last = cats[cats.length - 1];
      if (activeCategoryRef.current !== last) setActiveCategory(last);
    }
  }, []);

  // viewabilityConfig/callback создаются ОДИН раз (useRef), а не при каждом
  // render — иначе FlatList считает список "изменившимся" и теряет часть
  // оптимизаций виртуализации.
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 55, minimumViewTime: 50 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    if (navigationModeRef.current !== 'idle') return;

    // Берём ПОСЛЕДНИЙ прошедший порог видимости элемент с groupId (а не
    // первый попавшийся) — так частично видимый хвост предыдущей секции не
    // побеждает только что появившийся заголовок следующей.
    let candidate = null;
    for (let i = 0; i < viewableItems.length; i += 1) {
      const item = viewableItems[i]?.item;
      if (item?.groupId) candidate = item.groupId;
    }
    if (!candidate || candidate === activeCategoryRef.current) return;

    // Небольшая "мёртвая зона" по времени — не даёт chip дёргаться туда-сюда
    // ровно на границе двух секций при медленном скролле.
    const now = Date.now();
    if (now - lastSpySwitchAtRef.current < 180) return;
    lastSpySwitchAtRef.current = now;
    setActiveCategory(candidate);
  });

  useEffect(() => {
    const targetCategory = route?.params?.category;
    if (targetCategory && mainChips.some(item => item.id === targetCategory)) {
      const timer = setTimeout(() => jumpToCategory(targetCategory), 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.category, mainChips]);

  // ── renderItem и всё, что ему передаётся, стабилизированы через
  // useCallback/useMemo с точными зависимостями — так смена activeCategory
  // (просто подсветка чипа наверху) НЕ входит в зависимости и не заставляет
  // FlatList (PureComponent) перерисовывать все карточки товаров. ─────────
  const goProduct = useCallback((product) => navigation.navigate('Product', { product }), [navigation]);

  const renderItem = useCallback(({ item }) => {
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
    if (item.type === 'sectionEmpty') {
      return (
        <View style={[styles.sectionEmptyBox, { paddingHorizontal: hPad }]}>
          <Text style={styles.sectionEmptyText}>{item.label}</Text>
        </View>
      );
    }
    const productA = item.items[0];
    const productB = item.items[1];
    const qtyA = cart[cartKey(productA.id)]?.qty || 0;
    const qtyB = productB ? (cart[cartKey(productB.id)]?.qty || 0) : 0;
    return (
      <View style={[styles.gridRow, { paddingHorizontal: hPad, gap: columnGap }]}>
        <QuickProductCard
          product={productA}
          width={cardWidth}
          onPress={goProduct}
          onAdd={onAddToCart}
          qty={qtyA}
          onIncrement={() => onAddToCart(productA)}
          onDecrement={() => onDecrement?.(cartKey(productA.id))}
          isFavorite={favoriteIds.includes(productA.id)}
          onToggleFavorite={onToggleFavorite}
        />
        {productB ? (
          <QuickProductCard
            product={productB}
            width={cardWidth}
            onPress={goProduct}
            onAdd={onAddToCart}
            qty={qtyB}
            onIncrement={() => onAddToCart(productB)}
            onDecrement={() => onDecrement?.(cartKey(productB.id))}
            isFavorite={favoriteIds.includes(productB.id)}
            onToggleFavorite={onToggleFavorite}
          />
        ) : (
          <View style={{ width: cardWidth }} />
        )}
      </View>
    );
  }, [hPad, columnGap, cardWidth, cart, favoriteIds, goProduct, onAddToCart, onDecrement, onToggleFavorite, setSubFilter]);

  const listEmptyComponent = useMemo(() => (
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
  ), [hPad, products.length, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header — фиксированная чёрная шторка, не часть скролла. Внутренний
          ряд имеет собственную фиксированную высоту (HEADER_CONTENT_HEIGHT),
          а paddingTop только у внешнего контейнера отвечает за safe area. */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerSide}>
            <TouchableOpacity
              onPress={toggleSearch}
              style={styles.searchCircle}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? 'Закрыть поиск' : 'Открыть поиск'}
              hitSlop={8}
              activeOpacity={0.75}
            >
              <Ionicons name={searchOpen ? 'close' : 'search'} size={17} color={colors.accent} style={styles.searchIcon} />
            </TouchableOpacity>
          </View>
          <View style={styles.brandRow}>
            <Image source={require('../assets/logo-mark.png')} style={styles.brandLogo} resizeMode="contain" />
            <View style={styles.brandTextCol}>
              <Text style={styles.brandTitle}>SBL</Text>
              <Text style={styles.brandSubtitle}>COFFEE</Text>
            </View>
          </View>
          <View style={styles.headerSide} />
        </View>
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

      <MainCategoryBar chips={mainChips} activeId={activeCategory} onSelect={jumpToCategory} hPad={hPad} />

      <FlatList
        ref={mainListRef}
        data={listData}
        keyExtractor={keyExtractorRow}
        renderItem={renderItem}
        viewabilityConfig={viewabilityConfigRef.current}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onLayout={onFlatListLayout}
        scrollEventThrottle={16}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={onScrollToIndexFailed}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={40}
        ListEmptyComponent={listEmptyComponent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 2,
  },
  headerRow: {
    height: HEADER_CONTENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSide: {
    width: SEARCH_CIRCLE_SIZE,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  searchCircle: {
    width: SEARCH_CIRCLE_SIZE,
    height: SEARCH_CIRCLE_SIZE,
    borderRadius: SEARCH_CIRCLE_SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    marginLeft: 1,
    marginTop: 1,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  brandLogo: {
    width: 22,
    height: 22,
    tintColor: '#fff',
  },
  brandTextCol: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
    lineHeight: 16,
    color: colors.textOnDark,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    lineHeight: 11,
    marginTop: 2,
    color: 'rgba(255,255,255,0.5)',
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
  sectionEmptyBox: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  sectionEmptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
});
