import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, FlatList, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native';
import Text from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QuickProductCard from '../components/QuickProductCard';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import Chip from '../components/Chip';
import PrimaryButton from '../components/PrimaryButton';
import { colors, spacing, radius, getHorizontalPadding } from '../theme/tokens';
import { cartKey } from '../data/products';
import { buildCategoryList, buildSubcategoryList, collapseSizeVariants } from '../lib/catalogService';
import { resolveSubcategoryFilter } from '../lib/menuVisibility';

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


// Типовые высоты строк списка — используются только для оценки высоты
// последней секции (footerSpacerHeight), не для реальной раскладки.
const MAIN_HEADER_GAP = spacing.md;
const EST_MAIN_HEADER_H = MAIN_HEADER_GAP;
const EST_SUBCHIPS_H = 48;
const EST_SUBHEADER_H = 34;
const EST_EMPTY_ROW_H = 60;

const keyExtractorRow = (item) => item.key;

// Строка под-категорий внутри одного раздела — второй, менее выразительный
// уровень навигации. Фильтрует только товары текущего раздела.
const SubcategoryChips = React.memo(function SubcategoryChips({ subcats, activeSub, onSelect, hPad }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: hPad, paddingVertical: spacing.sm, alignItems: 'center', gap: spacing.xs }}
      style={styles.subchipRow}
    >
      <Chip small variant="main" label="Все" active={activeSub === 'all'} onPress={() => onSelect('all')} />
      {subcats.map(subcat => (
        <Chip key={subcat} small variant="main" label={subcat} active={activeSub === subcat} onPress={() => onSelect(subcat)} />
      ))}
    </ScrollView>
  );
});

export default function MenuScreen({ route, navigation, cart = {}, products = [], catalogLoading = false, catalogError = null, onRetryCatalog, onAddToCart, onDecrement, onToggleFavorite, favoriteIds = [], tabBarHeight }) {
  const mainCategories = useMemo(() => buildCategoryList(products), [products]);
  const mainChips = useMemo(
    () => [{ id: 'all', label: 'Все' }, ...mainCategories.map(id => ({ id, label: id }))],
    [mainCategories]
  );

  const [activeCategory, setActiveCategory] = useState('all');
  const [subFilters, setSubFilters] = useState({});
  const [viewportHeight, setViewportHeight] = useState(0);
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
  useEffect(() => {
    if (activeCategory !== 'all' && !mainCategories.includes(activeCategory)) {
      programmaticSequenceRef.current += 1;
      navigationModeRef.current = 'idle';
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
      setActiveCategory('all');
    }
  }, [mainCategories, activeCategory]);
  useEffect(() => () => { if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current); }, []);

  const listData = useMemo(() => {
    // Зависит ТОЛЬКО от данных и фильтров — ни scrollY, ни activeCategory
    // сюда не примешиваются: позиция скролла не имеет отношения к тому,
    // какие товары показывать.
    const rows = [];

    mainCategories.forEach(mainCat => {
      const itemsInCategory = collapseSizeVariants(products.filter(product => product.menuCategory === mainCat));
      if (!itemsInCategory.length) return;

      const subcats = buildSubcategoryList(products, mainCat);
      const activeSub = resolveSubcategoryFilter(subcats, subFilters[mainCat]);

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
  }, [products, mainCategories, subFilters]);

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
      // Название раздела и счётчик позиций не показываем, но сама строка нужна:
      // по ней работает прокрутка к разделу и scroll-spy. Остаётся только отступ.
      return <View style={styles.mainHeaderGap} />;
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

  const listEmptyComponent = useMemo(() => {
    if (catalogLoading) return (
      <View style={{ paddingHorizontal: hPad }} accessible accessibilityRole="progressbar" accessibilityLabel="Загружаем меню" accessibilityState={{ busy: true }}>
        <Text style={styles.loadingText}>Загружаем меню…</Text>
        {[0, 1].map(row => <View key={row} style={[styles.gridRow, { gap: columnGap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1].map(column => <View key={column} style={[styles.skeletonCard, { width: cardWidth }]}>
            <View style={styles.skeletonPhoto} /><View style={styles.skeletonTitle} /><View style={styles.skeletonPrice} />
          </View>)}
        </View>)}
      </View>
    );
    return (
      <View style={{ paddingHorizontal: hPad, paddingTop: spacing.xl }}>
        <EmptyState
          icon={catalogError ? 'cloud-offline-outline' : 'cafe-outline'}
          title={catalogError ? 'Не удалось загрузить меню' : 'Меню пока пусто'}
          subtitle={catalogError
            ? 'Проверьте подключение и попробуйте ещё раз. Ваш выбор в корзине сохранён.'
            : 'Сейчас нет доступных позиций. Обновите меню немного позже.'}
          action={onRetryCatalog ? <PrimaryButton label="Обновить меню" onPress={onRetryCatalog} /> : null}
        />
      </View>
    );
  }, [hPad, catalogLoading, catalogError, onRetryCatalog, cardWidth, columnGap]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Меню" action={onRetryCatalog ? <Pressable
          style={styles.headerRefresh}
          onPress={onRetryCatalog}
          disabled={catalogLoading}
          accessibilityRole="button"
          accessibilityLabel="Обновить меню"
          accessibilityState={{ disabled: catalogLoading }}
        >{catalogLoading ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} />}</Pressable> : null} />
      </View>

      {!!catalogError && products.length > 0 && <View style={[styles.staleNotice, { marginHorizontal: hPad }]} accessibilityLiveRegion="polite">
        <Ionicons name="cloud-offline-outline" size={20} color={colors.textPrimary} />
        <View style={{ flex: 1 }}><Text style={styles.staleTitle}>Не удалось обновить меню</Text><Text style={styles.staleText}>Показаны ранее загруженные позиции. Цены и наличие проверим при оформлении.</Text></View>
        {!!onRetryCatalog && <Pressable style={styles.retryButton} onPress={onRetryCatalog} disabled={catalogLoading} accessibilityRole="button" accessibilityLabel="Повторить обновление меню" accessibilityState={{ disabled: catalogLoading }}><Text style={styles.retryText}>{catalogLoading ? 'Обновляем…' : 'Повторить'}</Text></Pressable>}
      </View>}

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
        decelerationRate={0.98}
        overScrollMode="never"
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
  headerRefresh: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  skeletonCard: { borderRadius: radius.large, backgroundColor: colors.surfaceElevated, padding: spacing.md },
  skeletonPhoto: { aspectRatio: 1, backgroundColor: colors.skeleton, borderRadius: radius.medium, marginBottom: spacing.md },
  skeletonTitle: { height: 16, width: '80%', borderRadius: radius.small, backgroundColor: colors.skeleton, marginBottom: spacing.sm },
  skeletonPrice: { height: 14, width: '35%', borderRadius: radius.small, backgroundColor: colors.skeleton },
  staleNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, marginTop: spacing.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  staleTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  staleText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingLeft: spacing.sm },
  retryText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  subchipRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  mainHeaderGap: { height: MAIN_HEADER_GAP },
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
