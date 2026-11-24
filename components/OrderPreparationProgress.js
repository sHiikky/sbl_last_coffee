import React, { useEffect, useState } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from './AppText';
import HolographicSurface from './HolographicSurface';
import { preparationEstimate } from '../lib/preparationEstimate';
import { colors, radius, spacing } from '../theme/tokens';

const stages = [
  { statuses: ['new'], label: 'Ожидает принятия', icon: 'receipt-outline' },
  { statuses: ['accepted'], label: 'Заказ принят', icon: 'checkmark-outline' },
  { statuses: ['preparing'], label: 'Готовится', icon: 'cafe-outline' },
  { statuses: ['ready'], label: 'Готов к выдаче', icon: 'bag-check-outline' },
  { statuses: ['completed'], label: 'Выдан', icon: 'checkmark-done-outline' },
];

export default function OrderPreparationProgress({ status, changedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status !== 'preparing') return undefined;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(() => { if (AppState.currentState === 'active') tick(); }, 1000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [status, changedAt]);
  const active = stages.findIndex(stage => stage.statuses.includes(status));
  if (active < 0) return null;
  const estimate = preparationEstimate(status, changedAt, now);
  return <View style={styles.card}>
    <Text style={styles.heading}>Как готовится заказ</Text>
    <View style={styles.stages}>
      {stages.map((stage, index) => <View key={stage.label} style={styles.row}>
        <View style={styles.markerColumn}>
          {index < stages.length - 1 && <View style={[styles.connector, index < active && styles.connectorDone]} />}
          <View style={[styles.dot, index <= active && styles.dotActive]}><Ionicons name={index < active ? 'checkmark' : stage.icon} size={16} color={index <= active ? colors.textOnDark : colors.textMuted} /></View>
        </View>
        <Text style={[styles.label, index === active && styles.current]}>{stage.label}</Text>
        {index === active && <Text style={styles.now}>Сейчас</Text>}
      </View>)}
    </View>
    {status === 'preparing' && <View style={styles.timerCard}>
      <HolographicSurface style={StyleSheet.absoluteFill} borderRadius={radius.large} />
      <View style={styles.timerBody}>
        <Text style={styles.timerCaption}>Ориентировочная готовность</Text>
        <Text style={styles.timer} accessibilityLabel={estimate?.overdue ? 'Ожидаем готовности от бариста' : `До готовности примерно ${estimate?.label || '5 минут'}`}>{estimate?.overdue ? 'Ещё немного' : estimate?.label || '≈ 5 минут'}</Text>
        <Text style={styles.hint}>{estimate?.overdue ? 'Бариста ещё готовит. Сообщим, когда можно забирать.' : 'Обычно готовим за 5 минут. Готовность подтвердит бариста.'}</Text>
        {!!estimate && <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, estimate.progress * 100)}%` }]} /></View>}
      </View>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  card: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  heading: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  stages: { marginTop: spacing.md }, row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  markerColumn: { alignSelf: 'stretch', width: 30, justifyContent: 'center', alignItems: 'center' },
  connector: { position: 'absolute', top: '50%', height: '100%', width: 2, backgroundColor: colors.border }, connectorDone: { backgroundColor: colors.textPrimary },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, dotActive: { backgroundColor: colors.textPrimary },
  label: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary }, current: { fontWeight: '700', color: colors.textPrimary }, now: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  timerCard: { overflow: 'hidden', borderRadius: radius.large, marginTop: spacing.lg, padding: 2 },
  timerBody: { borderRadius: radius.large - 2, backgroundColor: colors.glassWhite, padding: spacing.lg, alignItems: 'center' },
  timerCaption: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' }, timer: { fontSize: 36, lineHeight: 46, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'], marginVertical: spacing.xs },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  track: { height: 4, width: '100%', backgroundColor: colors.border, borderRadius: radius.pill, marginTop: spacing.md, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.textPrimary, borderRadius: radius.pill },
});
