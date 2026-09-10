// components/QuantityStepper.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/tokens';

export default function QuantityStepper({ qty, onIncrement, onDecrement }) {
  const inc = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onIncrement(); };
  const dec = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDecrement(); };
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={dec} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel="Убрать один">
        <Text style={styles.minus}>−</Text>
      </TouchableOpacity>
      <Text style={styles.qty}>{qty}</Text>
      <TouchableOpacity onPress={inc} hitSlop={8} style={[styles.btn, styles.btnAccent]} accessibilityRole="button" accessibilityLabel="Добавить один">
        <Text style={styles.plus}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  btnAccent: { backgroundColor: colors.accent, borderWidth: 0 },
  minus: { fontSize: 18, color: colors.textPrimary },
  plus: { fontSize: 20, color: '#fff' },
  qty: { fontSize: 15, fontWeight: '700', minWidth: 18, textAlign: 'center', color: colors.textPrimary },
});
