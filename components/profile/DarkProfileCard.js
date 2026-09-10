// components/profile/DarkProfileCard.js
// Основная карточка пользователя тёмного профиля: аватар с голо-кольцом,
// имя/email/статус, статистика (бонусы / прогресс до подарка / заказы).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HolographicAvatarRing from './HolographicAvatarRing';
import HolographicProgressSegment from '../HolographicProgressSegment';
import { darkProfile, spacing, radius } from '../../theme/tokens';

export default function DarkProfileCard({
  name,
  email,
  status = 'STANDARD',
  avatarSource,
  bonuses = 0,
  loyaltyCurrent = 0,
  loyaltyTarget = 5,
  ordersCount = 0,
}) {
  const initials = getInitials(name);
  const progressPct = loyaltyTarget > 0 ? Math.min(1, loyaltyCurrent / loyaltyTarget) : 0;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[darkProfile.surfaceElevated, '#09090A', '#0E0E10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* едва заметный цветной блик в нижнем правом углу */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(120,170,255,0)', 'rgba(160,120,255,0.06)', 'rgba(120,220,190,0.05)', 'rgba(255,160,110,0)']}
        locations={[0, 0.4, 0.7, 1]}
        start={{ x: 0.2, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* тонкая светлая грань по верхнему краю карточки */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        style={styles.topEdge}
      />

      {/* едва заметный водяной знак SBL справа */}
      <Text pointerEvents="none" style={styles.watermark} numberOfLines={1}>SBL</Text>

      <View style={styles.content}>
        <View style={styles.userRow}>
          <HolographicAvatarRing size={78} source={avatarSource} initials={initials} />
          <View style={styles.userInfo}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{bonuses}</Text>
            <Text style={styles.statLabel}>бонусов</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{loyaltyCurrent} из {loyaltyTarget}</Text>
            <Text style={styles.statLabel}>до подарка</Text>
            <View style={styles.progressTrack}>
              <View style={{ width: `${progressPct * 100}%`, height: '100%', borderRadius: 3, overflow: 'hidden' }}>
                <HolographicProgressSegment filled height={6} />
              </View>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{ordersCount}</Text>
            <Text style={styles.statLabel}>заказов</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function getInitials(fullName) {
  if (!fullName) return '';
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: darkProfile.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 4,
  },
  topEdge: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
  },
  watermark: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.06)',
  },
  content: { padding: spacing.xl },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  userInfo: { flex: 1, marginLeft: spacing.md },
  name: { fontSize: 22, fontWeight: '700', color: darkProfile.text },
  email: { fontSize: 14, fontWeight: '400', color: darkProfile.textSecondary, marginTop: 2 },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    height: 30,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { fontSize: 11.5, fontWeight: '700', color: '#F1F1F1', letterSpacing: 0.8, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: darkProfile.divider, marginVertical: spacing.xl },
  statsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  statBox: { flex: 1 },
  statDivider: { width: 1, height: 34, backgroundColor: darkProfile.divider, marginHorizontal: spacing.sm },
  statValue: { fontSize: 26, fontWeight: '700', color: darkProfile.text },
  statLabel: { fontSize: 12.5, color: darkProfile.textSecondary, marginTop: 4 },
  progressTrack: {
    marginTop: 10,
    width: 100,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
});
