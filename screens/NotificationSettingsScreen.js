import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import Text from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, spacing } from '../theme/tokens';
import { getOrderNotificationSettings, enableOrderNotifications, disableOrderNotifications, describeNotificationError } from '../lib/notificationService';

export default function NotificationSettingsScreen({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setSettings(await getOrderNotificationSettings()); }
    catch (cause) { setError(describeNotificationError(cause)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (visible) void load(); }, [visible, load]);

  const change = async enabled => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (enabled) setSettings(await enableOrderNotifications());
      else { await disableOrderNotifications(); setSettings(await getOrderNotificationSettings()); }
    } catch (cause) { setError(describeNotificationError(cause)); }
    finally { setBusy(false); }
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }} presentationStyle="fullScreen">
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}><Text style={styles.title}>Уведомления о заказах</Text><TouchableOpacity onPress={onClose} disabled={busy} accessibilityRole="button" accessibilityLabel="Закрыть настройки уведомлений" style={styles.close}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity></View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Ionicons name="notifications-outline" size={32} color={colors.accent} />
          <Text style={styles.sectionTitle}>Готовность и отмена</Text>
          <Text style={styles.copy}>Сообщим, когда заказ будет готов к выдаче или отменён. Рекламные рассылки этим переключателем не включаются.</Text>
          <Text style={styles.copy}>Доставка сообщений зависит от подключения телефона. Текущий статус всегда можно проверить в приложении.</Text>
          {busy && !settings ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} /> : <Text style={styles.status}>{settings?.enabled ? 'Включены на этом устройстве' : 'Выключены на этом устройстве'}</Text>}
          {!!settings?.message && <Text style={styles.copy}>{settings.message}</Text>}
          <View style={{ marginTop: spacing.xl }}><PrimaryButton fullWidth label={settings?.enabled || settings?.registered ? 'Отключить уведомления' : 'Включить уведомления'} onPress={() => change(!settings?.enabled && !settings?.registered)} disabled={!settings || (!settings.supported && !settings.enabled && !settings.registered)} loading={busy} /></View>
          {settings?.supported && settings.permission === 'denied' && <TouchableOpacity onPress={() => Linking.openSettings().catch(() => setError('Не удалось открыть настройки телефона.'))} style={styles.action} accessibilityRole="button"><Text style={styles.link}>Открыть настройки телефона</Text></TouchableOpacity>}
        </View>
        {!!error && <View style={styles.card}><Text style={styles.error} accessibilityRole="alert">{error}</Text><TouchableOpacity onPress={load} disabled={busy} style={styles.action} accessibilityRole="button"><Text style={styles.link}>Проверить ещё раз</Text></TouchableOpacity></View>}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: 23, fontWeight: '800', color: colors.textPrimary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg },
  card: { backgroundColor: colors.surfaceElevated, padding: spacing.xl, borderRadius: radius.large, marginBottom: spacing.md },
  sectionTitle: { fontSize: 19, fontWeight: '700', marginTop: spacing.md, color: colors.textPrimary },
  copy: { fontSize: 14, lineHeight: 22, marginTop: spacing.md, color: colors.textSecondary },
  status: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xl },
  action: { minHeight: 44, justifyContent: 'center', marginTop: spacing.md },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
});
