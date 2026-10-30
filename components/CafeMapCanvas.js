import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, PanResponder, Platform, StyleSheet } from 'react-native';
import Text from './AppText';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '../theme/tokens';
import BrandLogo from './BrandLogo';
import CafeMapAttribution from './CafeMapAttribution';
import { CAFE_LOCATION, MAP_USER_AGENT, MAP_MIN_ZOOM, MAP_MAX_ZOOM, visibleMapTiles, mapPointInViewport, panMapCenter, zoomMapAt } from '../lib/cafeLocation';

function touchDistance(touches) {
  if (touches?.length !== 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

function MapTile({ tile, onLoad, onError }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <Image
    source={{ uri: tile.uri, cacheKey: `sbl-cafe-map/${tile.cacheKey}`, ...(Platform.OS === 'web' ? {} : { headers: { 'User-Agent': MAP_USER_AGENT } }) }}
    style={{ position: 'absolute', left: tile.left, top: tile.top, width: tile.size, height: tile.size }}
    contentFit="fill" cachePolicy="memory-disk" transition={0} accessible={false} pointerEvents="none"
    onLoad={() => { if (mounted.current) onLoad(); }} onError={() => { if (mounted.current) onError(); }} />;
}

export default function CafeMapCanvas({ width, height, interactive = false, camera, onCameraChange, userPosition, onOpen, onLinkError }) {
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedKeys, setLoadedKeys] = useState(() => new Set());
  const { center = CAFE_LOCATION, zoom = 16 } = camera || {};
  const tiles = useMemo(() => visibleMapTiles(width, height, zoom, center), [width, height, zoom, center]);
  const visible = useRef(new Set());
  visible.current = new Set(tiles.map(tile => tile.key));
  const generation = useRef(0);
  const current = useRef({ center, zoom, width, height, onCameraChange });
  current.current = { center, zoom, width, height, onCameraChange };
  const drag = useRef(null);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => interactive,
    onMoveShouldSetPanResponder: () => interactive,
    onPanResponderGrant: event => {
      const now = current.current;
      drag.current = { ...now, distance: touchDistance(event.nativeEvent.touches) };
    },
    onPanResponderMove: (event, gesture) => {
      const start = drag.current;
      if (!start) return;
      const touches = event.nativeEvent.touches, distance = touchDistance(touches);
      if (distance && !start.distance) { drag.current = { ...current.current, distance }; return; }
      if (distance && start.distance) {
        const nextZoom = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, start.zoom + Math.round(Math.log2(distance / start.distance))));
        if (nextZoom !== current.current.zoom) {
          const anchorX = (touches[0].locationX + touches[1].locationX) / 2;
          const anchorY = (touches[0].locationY + touches[1].locationY) / 2;
          start.onCameraChange?.({ zoom: nextZoom, center: zoomMapAt(start.center, start.zoom, nextZoom, anchorX, anchorY, start.width, start.height) });
        }
        return;
      }
      if (start.distance) { drag.current = { ...current.current, distance: 0, dx: gesture.dx, dy: gesture.dy }; return; }
      start.onCameraChange?.({ zoom: start.zoom, center: panMapCenter(start.center, start.zoom, gesture.dx - (start.dx || 0), gesture.dy - (start.dy || 0)) });
    },
    onPanResponderRelease: () => { drag.current = null; },
    onPanResponderTerminate: () => { drag.current = null; },
    onPanResponderTerminationRequest: () => true,
  }), [interactive]);
  const cafePoint = mapPointInViewport(CAFE_LOCATION, center, zoom, width, height);
  const userPoint = userPosition && mapPointInViewport(userPosition, center, zoom, width, height);
  const inView = (point, margin = 60) => point && point.x >= -margin && point.y >= -margin && point.x <= width + margin && point.y <= height + margin;
  const loading = !failure && tiles.some(tile => !loadedKeys.has(`${retry}:${tile.key}`));
  const tileGeneration = generation.current;
  return <View style={[styles.canvas, { width, height }, Platform.OS === 'web' && { touchAction: interactive ? 'none' : 'pan-y' }]}>
    <View style={StyleSheet.absoluteFill} {...(interactive ? responder.panHandlers : {})}>
      {!failure && tiles.map(tile => <MapTile key={`${retry}:${tile.key}`} tile={tile}
        onLoad={() => { if (generation.current === tileGeneration && visible.current.has(tile.key)) setLoadedKeys(previous => {
          const key = `${retry}:${tile.key}`; if (previous.has(key)) return previous;
          const next = new Set(previous.size >= 512 ? [...previous].slice(-256) : previous); next.add(key); return next;
        }); }}
        onError={() => { if (generation.current === tileGeneration && visible.current.has(tile.key)) setFailure(true); }} />)}
      {!failure && inView(cafePoint) && <View pointerEvents="none" style={[styles.marker, { left: cafePoint.x - 28, top: cafePoint.y - 57 }]}>
        <View style={styles.pin}><BrandLogo tone="light" width={40} /></View><View style={styles.pinPoint} />
        <View style={styles.pinLabel}><Text style={styles.pinText}>SBL</Text></View>
      </View>}
      {!failure && inView(userPoint, 20) && <View pointerEvents="none" style={[styles.userMarker, { left: userPoint.x - 12, top: userPoint.y - 12 }]} accessibilityLabel="Ваше приблизительное местоположение"><View style={styles.userDot} /><Text style={styles.userLabel}>Я</Text></View>}
    </View>
    {!interactive && !failure && <Pressable accessibilityRole="button" accessibilityLabel="Открыть интерактивную карту кофейни SBL" onPress={onOpen} style={StyleSheet.absoluteFill}>
      <View style={styles.expand}><Ionicons name="expand-outline" size={18} color={colors.textPrimary} /><Text style={styles.expandText}>Развернуть карту</Text></View>
    </Pressable>}
    {loading && <View pointerEvents="none" style={styles.loading}><ActivityIndicator size="small" color={colors.textSecondary} /><Text style={styles.loadingText}>Загружаем карту…</Text></View>}
    {failure && <View style={styles.fallback}>
      <Ionicons name="map-outline" size={32} color={colors.textSecondary} /><Text style={styles.fallbackTitle}>Карта не загрузилась</Text>
      <Text style={styles.fallbackText}>Томск, проспект Ленина, 72. Маршрут можно открыть в навигаторе.</Text>
      <Pressable accessibilityRole="button" onPress={() => { generation.current += 1; setLoadedKeys(new Set()); setRetry(value => value + 1); setFailure(false); }} style={styles.retry}><Text style={styles.retryText}>Повторить загрузку</Text></Pressable>
    </View>}
    <CafeMapAttribution onLinkError={onLinkError} />
  </View>;
}

const styles = StyleSheet.create({
  canvas: { overflow: 'hidden', backgroundColor: colors.skeleton },
  marker: { position: 'absolute', width: 56, alignItems: 'center' },
  pin: { width: 56, height: 48, borderRadius: radius.medium, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow.level1 },
  pinPoint: { width: 12, height: 12, backgroundColor: colors.accent, transform: [{ rotate: '45deg' }], marginTop: -6 },
  pinLabel: { backgroundColor: colors.surfaceElevated, borderRadius: radius.small, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginTop: spacing.xs },
  pinText: { color: colors.textPrimary, fontSize: 12, fontWeight: '800' },
  userMarker: { position: 'absolute', width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.surfaceElevated },
  userDot: { width: 12, height: 12, backgroundColor: colors.accent, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surfaceElevated },
  userLabel: { position: 'absolute', top: 25, fontSize: 12, fontWeight: '700', color: colors.textPrimary, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.xs, borderRadius: radius.small },
  expand: { position: 'absolute', top: spacing.sm, right: spacing.sm, minHeight: 44, borderRadius: radius.small, paddingHorizontal: spacing.md,
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.surfaceElevated },
  expandText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  loading: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceElevated, padding: spacing.sm, borderRadius: radius.small },
  loadingText: { color: colors.textSecondary, fontSize: 12 },
  fallback: { ...StyleSheet.absoluteFillObject, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  fallbackTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  fallbackText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 380 },
  retry: { minHeight: 44, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
