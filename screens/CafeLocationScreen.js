import React, { useState } from 'react';
import { View, ScrollView, Pressable, Linking, StyleSheet, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, getHorizontalPadding } from '../theme/tokens';
import { CAFE } from '../lib/ordering';
import { CAFE_LOCATION } from '../lib/cafeLocation';
import useCafeHours from '../hooks/useCafeHours';
import CafeMapCanvas from '../components/CafeMapCanvas';
import CafeInteractiveMap from '../components/CafeInteractiveMap';
import CafeRouteChooser from '../components/CafeRouteChooser';

const MAP_HEIGHT = 280;

export default function CafeLocationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const mapWidth = Math.max(1, Math.min(width - hPad * 2, 512));
  const hours = useCafeHours();
  const [fullMap, setFullMap] = useState(false);
  const [routes, setRoutes] = useState(false);
  const [linkError, setLinkError] = useState('');
  async function open(url) {
    try { setLinkError(''); await Linking.openURL(url); }
    catch (_) { setLinkError('Не удалось открыть карты. Попробуйте ещё раз или найдите адрес: Томск, проспект Ленина, 72.'); }
  }
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="arrow-back" size={23} color={colors.textPrimary} /></Pressable>
        <Text style={styles.headerTitle}>Наша кофейня</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={[styles.column, { width: mapWidth }]}>
          <Text style={styles.eyebrow}>ЕДИНСТВЕННАЯ ТОЧКА SBL</Text>
          <Text style={styles.title}>Увидимся на Ленина</Text>
          <Text style={styles.address}>Томск, проспект Ленина, 72</Text>
          <View style={[styles.mapCard, shadow.level1]}><CafeMapCanvas width={mapWidth} height={MAP_HEIGHT} onOpen={() => setFullMap(true)} onLinkError={setLinkError} /></View>

          <View style={styles.hoursCard}>
            <View style={styles.hoursTitleRow}><Text style={styles.cardTitle}>Каждый день</Text><Text style={styles.hours}>{hours.hoursLabel}</Text></View>
            <View style={styles.statusRow}><View style={[styles.dot, { backgroundColor: hours.physicallyOpen ? colors.success : colors.textMuted }]} /><Text style={styles.status}>{hours.statusLabel}</Text></View>
            <Text style={styles.copy}>Время Томска · заказы принимаем до 19:55</Text>
            <View style={styles.divider} />
            <View style={styles.detailRow}><Ionicons name="cafe-outline" size={20} color={colors.accent} /><Text style={styles.detailText}>Обычно готовим {CAFE.preparationMin}–{CAFE.preparationMax} минут</Text></View>
            <View style={styles.detailRow}><Ionicons name="bag-handle-outline" size={20} color={colors.accent} /><Text style={styles.detailText}>Самовывоз · оплата при получении</Text></View>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Выбрать навигатор и построить маршрут к SBL" onPress={() => setRoutes(true)} style={({ pressed }) => [styles.routeButton, pressed && styles.pressed]}><Ionicons name="navigate-outline" size={21} color={colors.textOnDark} /><Text style={styles.routeButtonText}>Построить маршрут</Text></Pressable>
          <View style={styles.mapLinks}>
            <Pressable accessibilityRole="link" accessibilityLabel="Открыть точку SBL в Яндекс Картах" onPress={() => open(CAFE_LOCATION.organisationUrl)} style={styles.openMaps}><Text style={styles.openMapsText}>Яндекс Карты</Text><Ionicons name="open-outline" size={15} color={colors.accent} /></Pressable>
            <View style={styles.linkDivider} />
            <Pressable accessibilityRole="link" accessibilityLabel="Открыть точку SBL в 2ГИС" onPress={() => open(CAFE_LOCATION.twoGisUrl)} style={styles.openMaps}><Text style={styles.openMapsText}>2ГИС</Text><Ionicons name="open-outline" size={15} color={colors.accent} /></Pressable>
          </View>
          {!!linkError && <Text style={styles.error} accessibilityRole="alert">{linkError}</Text>}
        </View>
      </ScrollView>
      {fullMap && <CafeInteractiveMap onClose={() => setFullMap(false)} />}
      <CafeRouteChooser visible={routes} onClose={() => setRoutes(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface0 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 44 }, column: { alignSelf: 'center' },
  eyebrow: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.4, marginTop: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: spacing.sm },
  address: { color: colors.textSecondary, fontSize: 16, marginTop: spacing.sm, marginBottom: spacing.xl },
  mapCard: { borderRadius: radius.large, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  hoursCard: { backgroundColor: colors.surfaceElevated, borderRadius: radius.large, padding: spacing.lg, marginTop: spacing.lg },
  hoursTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  hours: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  status: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  copy: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  detailRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  detailText: { color: colors.textPrimary, fontSize: 14, flex: 1, lineHeight: 21 },
  routeButton: { minHeight: 54, marginTop: spacing.xl, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.accent, flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center' },
  routeButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  mapLinks: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  openMaps: { flex: 1, minHeight: 48, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  linkDivider: { height: 16, width: 1, backgroundColor: colors.borderStrong },
  openMapsText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
});
