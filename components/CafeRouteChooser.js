import React, { useState } from 'react';
import { View, Pressable, Modal, Linking, StyleSheet } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/tokens';
import { CAFE_LOCATION } from '../lib/cafeLocation';

export default function CafeRouteChooser({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState('');
  async function open(url) {
    try { setError(''); await Linking.openURL(url); onClose(); }
    catch (_) { setError('Не удалось открыть навигатор. Попробуйте другой или найдите адрес: Томск, проспект Ленина, 72.'); }
  }
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Закрыть выбор навигатора" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]} accessibilityViewIsModal>
        <View style={styles.heading}><Text style={styles.title}>Как добраться</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть выбор навигатора" onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={colors.textPrimary} /></Pressable></View>
        <Text style={styles.copy}>SBL · Томск, проспект Ленина, 72</Text>
        <Pressable accessibilityRole="link" accessibilityLabel="Построить маршрут к SBL в Яндекс Картах" onPress={() => open(CAFE_LOCATION.routeUrl)} style={styles.option}>
          <Ionicons name="navigate-outline" size={23} color={colors.accent} /><Text style={styles.optionText}>Яндекс Карты</Text><Ionicons name="open-outline" size={19} color={colors.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Построить маршрут к SBL в 2ГИС" onPress={() => open(CAFE_LOCATION.twoGisRouteUrl)} style={styles.option}>
          <Ionicons name="map-outline" size={23} color={colors.accent} /><Text style={styles.optionText}>2ГИС</Text><Ionicons name="open-outline" size={19} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.footnote}>Маршрут откроется в приложении карт или его веб-версии.</Text>
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surfaceElevated, borderTopLeftRadius: radius.xlarge, borderTopRightRadius: radius.xlarge, padding: spacing.xxl },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginBottom: spacing.md },
  option: { minHeight: 60, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  optionText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  footnote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: spacing.lg },
  error: { fontSize: 14, lineHeight: 21, color: colors.danger, marginTop: spacing.md },
});
