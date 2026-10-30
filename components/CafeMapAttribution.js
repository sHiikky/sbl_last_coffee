import React, { useEffect, useState } from 'react';
import { View, Pressable, Modal, Linking, StyleSheet } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/tokens';
import { CAFE_LOCATION } from '../lib/cafeLocation';

// OSM's Interactive Maps guidelines allow collapse after five seconds, provided
// the licence remains discoverable through an information control on the map.
export default function CafeMapAttribution({ onLinkError }) {
  const [expanded, setExpanded] = useState(true);
  const [details, setDetails] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setExpanded(false), 5500); return () => clearTimeout(timer); }, []);
  const openLicence = async () => {
    try { await Linking.openURL(CAFE_LOCATION.osmCopyrightUrl); }
    catch (_) { onLinkError?.('Не удалось открыть лицензию карты. Адрес: openstreetmap.org/copyright'); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Информация об источнике карты" onPress={() => setDetails(true)} style={styles.control}>
      {expanded && <Text style={styles.credit}>© OpenStreetMap</Text>}
      <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
    </Pressable>
    <Modal visible={details} transparent animationType="none" onRequestClose={() => setDetails(false)}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Закрыть информацию о карте" onPress={() => setDetails(false)} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>Данные карты</Text>
          <Text style={styles.copy}>© OpenStreetMap contributors. Данные доступны по лицензии Open Database License (ODbL).</Text>
          <Pressable accessibilityRole="link" onPress={openLicence} style={styles.button}><Text style={styles.link}>Источник и лицензия</Text><Ionicons name="open-outline" size={17} color={colors.accent} /></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDetails(false)} style={styles.button}><Text style={styles.close}>Понятно</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  control: { position: 'absolute', right: spacing.xs, bottom: spacing.xs, minHeight: 44, minWidth: 44, paddingHorizontal: spacing.sm,
    flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', borderRadius: radius.small, backgroundColor: colors.surfaceElevated },
  credit: { fontSize: 12, color: colors.textSecondary },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  sheet: { maxWidth: 400, width: '100%', padding: spacing.xxl, backgroundColor: colors.surfaceElevated, borderRadius: radius.large },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  copy: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: spacing.md },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  link: { fontSize: 14, fontWeight: '600', color: colors.accent }, close: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
});
