import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PrimaryButton from './PrimaryButton';
import ToggleSwitch from './ToggleSwitch';
import { colors, radius, spacing } from '../theme/tokens';
import {
  getOrderNotificationSupport, getOrderNotificationSettings, enableOrderNotifications,
  setPushPreferences, shouldShowPushPrompt, markPushPrompt, describeNotificationError,
} from '../lib/notificationService';

const SHOW_DELAY_MS = 1800;

// Pre-permission sheet shown once the guest is signed in: explains what they will
// receive and lets them pick optional categories BEFORE the system dialog appears.
// "Не сейчас" asks again after 7 days (max 3 times); a system "deny" ends the prompts.
export default function NotificationPrompt({ userId, blocked = false }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  // Optional categories are opt-in: the guest switches them on explicitly.
  const [promotions, setPromotions] = useState(false);
  const [series, setSeries] = useState(false);
  // Once closed in this session the sheet never re-opens by itself (storage writes are async).
  const closed = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId || blocked || visible || closed.current) return undefined;
    let active = true;
    let timer = null;
    (async () => {
      try {
        if (!getOrderNotificationSupport().supported) return;
        const settings = await getOrderNotificationSettings();
        if (!active || settings.userId !== userId || settings.enabled || settings.permission === 'denied') return;
        if (!(await shouldShowPushPrompt(userId))) return;
        timer = setTimeout(() => { if (active && !closed.current) setVisible(true); }, SHOW_DELAY_MS);
      } catch { /* the prompt is optional; the profile still offers notifications */ }
    })();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [userId, blocked, visible]);

  if (!visible) return null;

  const later = async () => {
    if (busy) return;
    closed.current = true; setBusy(true); setError('');
    try { await markPushPrompt(userId); }
    finally { setBusy(false); setVisible(false); }
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await enableOrderNotifications();
      await markPushPrompt(userId, { done: true });
      if (promotions || series) {
        try { await setPushPreferences({ promotions, seriesReminders: series }); }
        catch { /* order pushes work; categories can be set in the profile */ }
      }
      closed.current = true; setVisible(false);
    } catch (cause) {
      if (cause?.code === 'PERMISSION_DENIED') { await markPushPrompt(userId, { done: true }); closed.current = true; setVisible(false); }
      else setError(describeNotificationError(cause));
    } finally { setBusy(false); }
  };

  return <Modal visible transparent animationType="slide" onRequestClose={later} statusBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={later} accessibilityRole="button" accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md }]} accessibilityViewIsModal>
        <View style={styles.icon}><Ionicons name="notifications-outline" size={30} color={colors.accent} /></View>
        <Text style={styles.title}>Включить уведомления?</Text>
        <Text style={styles.copy}>Подскажем, когда заказ примут и когда он будет готов — не придётся следить за экраном.</Text>
        <View style={styles.row}>
          <View style={styles.rowText}><Text style={styles.rowTitle}>Статус заказа</Text><Text style={styles.rowHint}>Принят, готов, отменён</Text></View>
          <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}><Text style={styles.rowTitle}>Акции и новости</Text><Text style={styles.rowHint}>Только важное, без спама</Text></View>
          <ToggleSwitch value={promotions} onValueChange={setPromotions} disabled={busy} accessibilityLabel="Акции и новости" />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}><Text style={styles.rowTitle}>Напоминания о серии</Text><Text style={styles.rowHint}>Не более одного в день</Text></View>
          <ToggleSwitch value={series} onValueChange={setSeries} disabled={busy} accessibilityLabel="Напоминания о серии" />
        </View>
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        <View style={{ marginTop: spacing.lg }}><PrimaryButton fullWidth label="Включить уведомления" onPress={enable} loading={busy} haptic="light" /></View>
        <Pressable onPress={later} disabled={busy} accessibilityRole="button" style={styles.later}><Text style={styles.laterText}>Не сейчас</Text></Pressable>
        <Text style={styles.footnote}>Переключатели можно поменять в профиле в любое время.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.surfaceElevated, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, padding: spacing.xl },
  icon: { width: spacing.section + spacing.xl, height: spacing.section + spacing.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
  copy: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.md },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, paddingVertical: spacing.sm },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  rowHint: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: { fontSize: 14, lineHeight: 20, color: colors.danger, marginTop: spacing.md },
  later: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  laterText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  footnote: { fontSize: 12, textAlign: 'center', color: colors.textSecondary },
});
