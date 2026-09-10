// components/HomeLoyaltyCard.js
// Карточка бонусной программы на Главной — премиальная тёмная карта в духе
// "моя карта" у крупных сетей (Starbucks Stars и т.п.), но в стилистике SBL:
// чёрный акрил + фирменный голографический прогресс вместо однотонной заливки.
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import HolographicProgressSegment from './HolographicProgressSegment';
import { colors, spacing, radius, darkProfile } from '../theme/tokens';

export default function HomeLoyaltyCard({ bonuses = 0, rate = 0.05, level = 1, toNextLevel = null, progress = 0, onPressInfo }) {
  const handleInfo = () => {
    Haptics.selectionAsync();
    onPressInfo?.();
  };
  const hint = toNextLevel != null
    ? `${toNextLevel} ₽ до ${level + 1} уровня`
    : 'Максимальный уровень';

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[darkProfile.surfaceElevated, '#09090A', '#0E0E10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* фирменная вертикальная надпись у левого края — как "STARS" у конкурентов */}
      <View pointerEvents="none" style={styles.sideLabelWrap}>
        <Ionicons name="star" size={11} color="rgba(255,255,255,0.14)" style={{ marginBottom: 8 }} />
        <Text style={styles.sideLabel}>SBL</Text>
        <Ionicons name="star" size={11} color="rgba(255,255,255,0.14)" style={{ marginTop: 8 }} />
      </View>

      {/* едва заметный водяной знак-монограмма справа */}
      <Image
        source={require('../assets/logo-mark.png')}
        pointerEvents="none"
        style={styles.watermark}
        resizeMode="contain"
      />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Моя карта SBL</Text>
            <Text style={styles.subtitle}>Уровень {level} · кэшбек {Math.round(rate * 100)}%</Text>
          </View>
          <TouchableOpacity
            onPress={handleInfo}
            hitSlop={6}
            style={styles.infoPill}
            accessibilityRole="button"
            accessibilityLabel="О программе лояльности"
          >
            <Text style={styles.infoPillText}>о карте</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.valueRow}>
          <Text style={styles.value}>{bonuses}</Text>
          <Ionicons name="star" size={20} color="#fff" style={{ marginLeft: 6, marginBottom: 6 }} />
        </View>
        <Text style={styles.valueLabel}>бонусов на счету</Text>

        <View style={styles.progressTrack}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 4, overflow: 'hidden' }}>
            <HolographicProgressSegment filled animated height={8} />
          </View>
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.hint}>{hint}</Text>
          <View style={styles.qrBadge}>
            <Ionicons name="qr-code-outline" size={16} color="rgba(255,255,255,0.72)" />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xlarge,
    borderWidth: 1,
    borderColor: darkProfile.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 4,
  },
  content: { padding: spacing.lg, paddingLeft: spacing.xl + 14 },
  sideLabelWrap: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.16)',
    transform: [{ rotate: '-90deg' }],
  },
  watermark: {
    position: 'absolute',
    right: -18,
    bottom: -14,
    width: 120,
    height: 60,
    opacity: 0.05,
    tintColor: '#fff',
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: darkProfile.text },
  subtitle: { fontSize: 12.5, color: darkProfile.textSecondary, marginTop: 2 },
  infoPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoPillText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
  value: { fontSize: 42, fontWeight: '800', color: darkProfile.text, lineHeight: 46 },
  valueLabel: { fontSize: 12.5, color: darkProfile.textSecondary, marginTop: 2, marginBottom: spacing.md },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  hint: { fontSize: 12, color: darkProfile.textSecondary },
  qrBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
});
