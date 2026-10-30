// components/QuantityStepper.js
// Степпер количества. Визуально кружки 28 px, но зона нажатия каждой кнопки
// 44 px по высоте (36 px по ширине при tight — для тесных строк корзины).
// compact — кружки 28 px с hitSlop вместо 44-пиксельных боксов, для узких
// мест вроде карточки товара.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from './AppText';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';

export default function QuantityStepper({ qty, onIncrement, onDecrement, tight = false, compact = false, onDark = false }) {
  const inc = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onIncrement(); };
  const dec = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDecrement(); };
  const boxStyle = compact ? styles.boxCompact : [styles.box, tight && styles.boxTight];
  const slop = compact ? 8 : 0;
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <TouchableOpacity onPress={dec} hitSlop={slop} style={boxStyle} accessibilityRole="button" accessibilityLabel="Убрать один">
        <View style={[styles.circle, onDark && styles.circleOnDark]}>
          <Ionicons name="remove" size={16} color={onDark ? colors.textOnDark : colors.textPrimary} />
        </View>
      </TouchableOpacity>
      <Text style={[styles.qty, compact && styles.qtyCompact, onDark && { color: colors.textOnDark }]}>{qty}</Text>
      <TouchableOpacity onPress={inc} hitSlop={slop} style={boxStyle} accessibilityRole="button" accessibilityLabel="Добавить один">
        <View style={[styles.circle, styles.circleAccent]}>
          <Ionicons name="add" size={16} color={colors.textOnDark} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowCompact: { gap: 4 },
  box: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  boxTight: { width: 36 },
  boxCompact: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleOnDark: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.35)' },
  circleAccent: { backgroundColor: colors.accent, borderColor: colors.accent },
  qty: { fontSize: 15, fontWeight: '700', minWidth: 16, textAlign: 'center', color: colors.textPrimary },
  qtyCompact: { minWidth: 18 },
});
