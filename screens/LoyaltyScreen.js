// screens/LoyaltyScreen.js
// Полный экран программы лояльности "Серия SBL": статус, карта текущего
// 10-дневного этапа, месячный календарь посещений, правила. Вся бизнес-логика
// вычислена заранее в loyalty/useLoyaltyState.js — здесь только рендер.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HoloLine from '../components/HoloLine';
import PrimaryButton from '../components/PrimaryButton';
import LoyaltyPath from '../components/loyalty/LoyaltyPath';
import LoyaltyCalendar from '../components/loyalty/LoyaltyCalendar';
import LoyaltyRulesCard from '../components/loyalty/LoyaltyRulesCard';
import { colors, spacing, radius, getHorizontalPadding } from '../theme/tokens';
import { getCurrentLoyaltyPath, getDaysUntilNextMilestone } from '../loyalty/loyaltySelectors';
import { LOYALTY_CONFIG } from '../loyalty/loyaltyConfig';
import { pluralDays } from '../loyalty/loyaltyText';

function StatusBlock({ loyaltyState }) {
  const { todayStatus, currentStreak, longestStreak } = loyaltyState;
  const daysUntilReward = getDaysUntilNextMilestone(loyaltyState, LOYALTY_CONFIG);
  const milestoneReached = daysUntilReward === 0;

  if (todayStatus === 'new') {
    return (
      <View>
        <Text style={styles.statusTitle}>🔥 Серия ещё не началась</Text>
        <Text style={styles.statusSubtitle}>Начни свой маршрут</Text>
        <Text style={styles.statusBody}>
          Совершай хотя бы одну покупку в день. {LOYALTY_CONFIG.milestones[0]?.streakDays ?? 10} дней подряд — награда.
        </Text>
      </View>
    );
  }

  if (todayStatus === 'broken') {
    return (
      <View>
        <Text style={styles.statusTitle}>Серия прервалась</Text>
        <Text style={styles.statusBody}>
          Вы дошли до {currentStreak} {pluralDays(currentStreak)} подряд. Новая серия начнётся со следующей покупки.
        </Text>
        <Text style={styles.statusFootnote}>Лучший результат: {longestStreak} {pluralDays(longestStreak)} подряд</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.statusTitle}>🔥 {currentStreak} {pluralDays(currentStreak)} подряд</Text>
      {milestoneReached ? (
        <Text style={styles.statusSubtitle}>Награда ваша</Text>
      ) : (
        <Text style={styles.statusSubtitle}>До награды осталось {daysUntilReward} {pluralDays(daysUntilReward)}</Text>
      )}
      <Text style={styles.statusBody}>
        {todayStatus === 'completed' ? 'Сегодня уже засчитано ✓' : 'Серия активна — зайди сегодня, чтобы продолжить'}
      </Text>
    </View>
  );
}

export default function LoyaltyScreen({ navigation, loyaltyState, devSimulateToday, devSimulateTenDayStreak, devResetLoyalty }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);

  const nodes = getCurrentLoyaltyPath(loyaltyState, LOYALTY_CONFIG);
  const goMenu = () => navigation.navigate('Tabs', { screen: 'MenuTab' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Серия SBL</Text>
        <View style={styles.backButton} />
      </View>

      <View style={{ height: spacing.md }} />
      <HoloLine marginHorizontal={hPad} height={5} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {loyaltyState.error ? (
          <View>
            <Text style={styles.statusBody}>Не удалось обновить серию. Проверьте подключение к интернету.</Text>
            <PrimaryButton label="Обновить" onPress={loyaltyState.refresh} />
          </View>
        ) : !loyaltyState.ready ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            <StatusBlock loyaltyState={loyaltyState} />

            <View style={{ marginTop: spacing.xxl }}>
              <LoyaltyPath nodes={nodes} size="full" />
            </View>

            {(loyaltyState.todayStatus === 'broken' || loyaltyState.todayStatus === 'new') && (
              <View style={{ marginTop: spacing.xl }}>
                <PrimaryButton label="Выбрать напиток" fullWidth variant="holo" onPress={goMenu} />
              </View>
            )}

            <View style={{ marginTop: spacing.xxl }}>
              <LoyaltyCalendar visitedDays={loyaltyState.visitedDays} todayKey={loyaltyState.today} />
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <LoyaltyRulesCard />
            </View>

            {__DEV__ && loyaltyState.localSimulationEnabled && (
              <View style={styles.devPanel}>
                <Text style={styles.devTitle}>DEV: тестирование серии</Text>
                <View style={styles.devRow}>
                  <TouchableOpacity style={styles.devButton} onPress={devSimulateToday}>
                    <Text style={styles.devButtonText}>+1 день (сегодня)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.devButton} onPress={devSimulateTenDayStreak}>
                    <Text style={styles.devButtonText}>Серия 10 дней</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.devButton} onPress={devResetLoyalty}>
                    <Text style={styles.devButtonText}>Сбросить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  statusTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  statusSubtitle: { fontSize: 14, fontWeight: '600', color: colors.accent, marginTop: 6 },
  statusBody: { fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 19 },
  statusFootnote: { fontSize: 11.5, color: colors.textMuted, marginTop: 10 },
  skeleton: { height: 220, borderRadius: radius.large, backgroundColor: colors.skeleton },
  devPanel: {
    marginTop: spacing.xxl,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  devTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  devRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  devButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.small, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  devButtonText: { fontSize: 11, fontWeight: '600', color: colors.textPrimary },
});
