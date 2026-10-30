import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, AppState, Modal, Platform, StyleSheet } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../theme/tokens';
import { CAFE_LOCATION, MAP_MIN_ZOOM, MAP_MAX_ZOOM, fitMapCoordinates } from '../lib/cafeLocation';
import { requestMapPosition, requestBrowserMapPosition } from '../lib/mapPosition';
import CafeMapCanvas from './CafeMapCanvas';
import CafeRouteChooser from './CafeRouteChooser';

export default function CafeInteractiveMap({ onClose }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState({ center: CAFE_LOCATION, zoom: 16 });
  const [userPosition, setUserPosition] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [routes, setRoutes] = useState(false);
  const pending = useRef(null);
  const mounted = useRef(true);
  const currentSize = useRef(size); currentSize.current = size;
  useEffect(() => {
    mounted.current = true;
    const cancel = () => { pending.current?.cancel(); pending.current = null; };
    const subscription = AppState.addEventListener('change', state => {
      // iOS permission dialogs can briefly report "inactive"; only a real
      // background transition cancels the foreground request.
      if (state === 'background') { cancel(); if (mounted.current) setBusy(false); }
    });
    return () => { mounted.current = false; cancel(); subscription.remove(); };
  }, []);
  async function locate() {
    if (pending.current || AppState.currentState === 'background') return;
    setError(''); setBusy(true);
    const request = Platform.OS === 'web'
      ? requestBrowserMapPosition(typeof navigator !== 'undefined' ? navigator.geolocation : null)
      : requestMapPosition(Location);
    pending.current = request;
    try {
      const position = await request.promise;
      if (!mounted.current || pending.current !== request) return;
      setUserPosition(position);
      const { width, height } = currentSize.current;
      setCamera(fitMapCoordinates([CAFE_LOCATION, position], width, height));
    } catch (failure) {
      if (mounted.current && pending.current === request && failure.code !== 'cancelled') setError(failure.message);
    } finally {
      if (mounted.current && pending.current === request) { pending.current = null; setBusy(false); }
    }
  }
  const close = () => { pending.current?.cancel(); pending.current = null; onClose(); };
  return <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={close}>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть полную карту" onPress={close} style={styles.close}><Ionicons name="arrow-back" size={23} color={colors.textPrimary} /></Pressable>
        <View style={styles.headerCopy}><Text style={styles.headerTitle}>Наша кофейня</Text><Text style={styles.headerAddress}>Томск, проспект Ленина, 72</Text></View>
      </View>
      <View style={styles.mapArea} onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        const next = { width: Math.min(2048, Math.round(width)), height: Math.min(2048, Math.round(height)) };
        setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
      }}>
        {size.width > 0 && size.height > 0 && <CafeMapCanvas width={size.width} height={size.height} interactive camera={camera} onCameraChange={setCamera} userPosition={userPosition} onLinkError={setError} />}
        <View style={styles.controls}>
          <View style={styles.zoomGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel="Приблизить карту" disabled={camera.zoom >= MAP_MAX_ZOOM} onPress={() => setCamera(previous => ({ ...previous, zoom: Math.min(MAP_MAX_ZOOM, previous.zoom + 1) }))} style={[styles.control, camera.zoom >= MAP_MAX_ZOOM && styles.disabled]}><Ionicons name="add" size={25} color={colors.textPrimary} /></Pressable>
            <View style={styles.zoomDivider} />
            <Pressable accessibilityRole="button" accessibilityLabel="Отдалить карту" disabled={camera.zoom <= MAP_MIN_ZOOM} onPress={() => setCamera(previous => ({ ...previous, zoom: Math.max(MAP_MIN_ZOOM, previous.zoom - 1) }))} style={[styles.control, camera.zoom <= MAP_MIN_ZOOM && styles.disabled]}><Ionicons name="remove" size={25} color={colors.textPrimary} /></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Показать моё местоположение на карте" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={locate} style={[styles.control, styles.separateControl]}>{busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="locate-outline" size={24} color={colors.accent} />}</Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Вернуть карту к кофейне SBL" onPress={() => setCamera({ center: CAFE_LOCATION, zoom: 16 })} style={[styles.control, styles.separateControl]}><Ionicons name="cafe-outline" size={23} color={colors.textPrimary} /></Pressable>
        </View>
        {!!userPosition && <Pressable accessibilityRole="button" accessibilityLabel="Показать на карте меня и кофейню" onPress={() => setCamera(fitMapCoordinates([CAFE_LOCATION, userPosition], size.width, size.height))} style={styles.showBoth}><Ionicons name="scan-outline" size={18} color={colors.textPrimary} /><Text style={styles.showBothText}>Я и SBL</Text></Pressable>}
        {!!error && <View style={styles.notice} accessibilityRole="alert"><Text style={styles.noticeText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть сообщение карты" onPress={() => setError('')} style={styles.noticeClose}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable></View>}
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.footerRow}><View style={styles.footerCopy}><Text style={styles.footerTitle}>SBL на Ленина</Text><Text style={styles.footerAddress}>Ежедневно 11:00–20:00</Text></View>
          <Pressable accessibilityRole="button" onPress={() => setRoutes(true)} style={styles.route}><Ionicons name="navigate-outline" size={20} color={colors.textOnDark} /><Text style={styles.routeText}>Маршрут</Text></Pressable>
        </View>
        <Text style={styles.hint}>{userPosition ? 'Метка «Я» показывает место последнего определения.' : 'Перемещайте карту. Кнопка прицела покажет, где вы.'}</Text>
      </View>
      <CafeRouteChooser visible={routes} onClose={() => setRoutes(false)} />
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface0 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  close: { width: 44, height: 44, backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 }, headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  headerAddress: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  mapArea: { flex: 1, overflow: 'hidden', backgroundColor: colors.skeleton },
  controls: { position: 'absolute', right: spacing.md, top: spacing.lg, gap: spacing.sm },
  zoomGroup: { borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, overflow: 'hidden', ...shadow.level1 },
  zoomDivider: { height: 1, marginHorizontal: spacing.sm, backgroundColor: colors.border },
  control: { width: 48, height: 48, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  separateControl: { borderRadius: radius.medium, ...shadow.level1 }, disabled: { opacity: 0.45 },
  showBoth: { position: 'absolute', top: spacing.lg, left: spacing.md, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, ...shadow.level1 },
  showBothText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  notice: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 56, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, padding: spacing.md, flexDirection: 'row', alignItems: 'center', ...shadow.level1 },
  noticeText: { flex: 1, color: colors.textPrimary, fontSize: 14, lineHeight: 20 }, noticeClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { backgroundColor: colors.surfaceElevated, padding: spacing.lg }, footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerCopy: { flex: 1 }, footerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary }, footerAddress: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  route: { minHeight: 48, paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: radius.pill },
  routeText: { fontSize: 15, fontWeight: '700', color: colors.textOnDark }, hint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: spacing.md },
});
