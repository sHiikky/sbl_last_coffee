import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from './AppText';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import BrandLogo from './BrandLogo';
import LoyaltyCardSheen from './LoyaltyCardSheen';
import { satinCard } from '../theme/satinCard';

const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : String(value ?? 0);
// A single native gradient, not a list of extra views: one faint horizontal
// highlight per ~3px on the selected 249px card, matching the satin prototype.
const BRUSH_COLORS = Array.from({ length: 250 }, (_, index) => index % 3 === 1 ? satinCard.brush : satinCard.brushClear);

// Selected option Д: «Сатиновое серебро». All values remain live props.
export default function HomeLoyaltyCard({ bonuses = 0, rate = 0.05, level = 1, toNextLevel = null, progress = 0, onPressInfo }) {
  const isFocused = useIsFocused();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const progressValue = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const hint = toNextLevel != null ? `${number(toNextLevel)} ₽ до ${level + 1} уровня` : 'Максимальный уровень';
  const handleInfo = () => { Haptics.selectionAsync().catch(() => {}); onPressInfo?.(); };
  return (
    <View onLayout={event => { const { width, height } = event.nativeEvent.layout; setLayout(previous => previous.width === width && previous.height === height ? previous : { width, height }); }} style={[styles.wrap, satinCard.shadow]}>
      <LinearGradient colors={satinCard.base} locations={satinCard.baseStops} start={{ x: 0, y: 0.32 }} end={{ x: 1, y: 0.68 }} style={StyleSheet.absoluteFill} />
      <LinearGradient pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" colors={BRUSH_COLORS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.brush} />
      <View style={styles.content}>
        <View style={styles.header}>
          <BrandLogo width={90} tone="dark" variant="mark" />
          <TouchableOpacity onPress={handleInfo} style={styles.infoButton} accessibilityRole="button" accessibilityLabel="Моя карта. О программе лояльности">
            <Text style={styles.cardName}>Моя карта</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.balanceRow}>
          <View style={styles.balance}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{number(bonuses)}</Text>
            <Text style={styles.valueLabel}>бонусов на счету</Text>
          </View>
          <View style={styles.cashback}>
            <Text style={styles.rateValue}>{Math.round(rate * 100)}<Text style={styles.percent}>%</Text></Text>
            <Text style={styles.rateLabel}>кэшбэк</Text>
          </View>
        </View>
        <View style={styles.bottom}>
          <View style={styles.progressLabels}>
            <Text style={styles.level}>Уровень {level}</Text>
            <Text style={styles.hint}>{hint}</Text>
          </View>
          <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel="Прогресс до следующего уровня" accessibilityValue={{ min: 0, max: 100, now: Math.round(progressValue * 100), text: toNextLevel == null ? 'Максимальный уровень' : `${Math.round(progressValue * 100)}%. ${hint}` }}>
            <LinearGradient colors={satinCard.trackSpectrum} locations={satinCard.spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { opacity: satinCard.trackOpacity }]} />
            <View style={[styles.progressFill, { width: `${progressValue * 100}%` }]}>
              <LinearGradient colors={satinCard.fillSpectrum} locations={satinCard.spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </View>
          </View>
        </View>
      </View>
      <LoyaltyCardSheen width={layout.width} height={layout.height} enabled={isFocused} />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { borderRadius: 26, backgroundColor: satinCard.base[0], borderWidth: 1, borderColor: satinCard.border, overflow: 'hidden' },
  brush: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
  content: { minHeight: 247, paddingHorizontal: 25, paddingTop: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  infoButton: { minHeight: 44, minWidth: 88, alignItems: 'flex-end', justifyContent: 'center', paddingLeft: 12 },
  cardName: { fontSize: 12, fontWeight: '600', color: satinCard.cardName },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, marginTop: 15, marginBottom: 21 },
  balance: { flex: 1, minWidth: 0 },
  value: { fontSize: 67, lineHeight: 66, fontWeight: '900', letterSpacing: -3, color: satinCard.text, fontVariant: ['tabular-nums'] },
  valueLabel: { fontSize: 12, lineHeight: 18, color: satinCard.secondary, marginTop: 6 },
  cashback: { width: 79, height: 79, flexShrink: 0, borderRadius: 40, backgroundColor: satinCard.cashback, borderTopWidth: 1, borderTopColor: satinCard.cashbackEdge, alignItems: 'center', justifyContent: 'center' },
  rateValue: { fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -1, color: satinCard.cashbackText },
  percent: { fontSize: 18, letterSpacing: 0 },
  rateLabel: { fontSize: 12, lineHeight: 16, color: satinCard.cashbackCaption, marginTop: 5 },
  bottom: { marginTop: 'auto' },
  progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  level: { fontSize: 12, lineHeight: 17, fontWeight: '600', color: satinCard.text },
  hint: { fontSize: 12, lineHeight: 17, color: satinCard.secondary, flexShrink: 1, textAlign: 'right' },
  progressTrack: { height: 5, borderRadius: 999, backgroundColor: satinCard.track, borderWidth: StyleSheet.hairlineWidth, borderColor: satinCard.trackEdge, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, overflow: 'hidden' },
});
