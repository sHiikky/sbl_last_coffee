// components/loyalty/LoyaltyCalendar.js
// Компактный календарь месяца с реальной историей посещений (visitedDays).
// Не считает выходные активными сам по себе — заливка идёт только там, где
// действительно есть посещённый день. Переключение month только назад/вперёд
// до текущего месяца (будущее не может быть "выполнено").
import React, { useState, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/tokens';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function pad2(n) { return String(n).padStart(2, '0'); }
function keyOf(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function buildMonthGrid(year, month) {
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Пн=0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateKey: keyOf(year, month, d) });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function LoyaltyCalendar({ visitedDays = [], todayKey }) {
  const [y, m] = (todayKey || '2026-01-01').split('-').map(Number);
  const currentYear = y;
  const currentMonth = m - 1;

  const [offset, setOffset] = useState(0);

  const viewDate = useMemo(() => {
    const total = currentMonth + offset;
    const year = currentYear + Math.floor(total / 12);
    const month = ((total % 12) + 12) % 12;
    return { year, month };
  }, [currentYear, currentMonth, offset]);

  const visitedSet = useMemo(() => new Set(visitedDays), [visitedDays]);
  const cells = useMemo(() => buildMonthGrid(viewDate.year, viewDate.month), [viewDate]);

  const canGoNext = offset < 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setOffset(o => o - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Предыдущий месяц">
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{MONTH_NAMES[viewDate.month]} {viewDate.year}</Text>
        <TouchableOpacity
          onPress={() => canGoNext && setOffset(o => o + 1)}
          hitSlop={10}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Следующий месяц"
        >
          <Ionicons name="chevron-forward" size={18} color={canGoNext ? colors.textPrimary : colors.disabled} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map(w => (
          <Text key={w} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`empty_${i}`} style={styles.cell} />;

          const visited = visitedSet.has(cell.dateKey);
          const isToday = cell.dateKey === todayKey;

          return (
            <View key={cell.dateKey} style={styles.cell}>
              <View
                style={[
                  styles.dayCircle,
                  visited && styles.dayVisited,
                  !visited && isToday && styles.dayToday,
                ]}
                accessible
                accessibilityLabel={visited ? `${cell.dateKey}, посещение выполнено` : cell.dateKey}
              >
                <Text style={[styles.dayText, visited && styles.dayTextVisited]}>{cell.day}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: 10.5, color: colors.textMuted, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 2 },
  dayCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  dayVisited: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 1.5, borderColor: colors.accent },
  dayText: { fontSize: 12.5, color: colors.textPrimary },
  dayTextVisited: { color: '#fff', fontWeight: '700' },
});
