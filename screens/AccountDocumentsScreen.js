import React, { useEffect, useState } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, getHorizontalPadding } from '../theme/tokens';
import { privacyPolicySections, privacyPolicyApproved, privacyPolicyContact } from '../data/privacyPolicy';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || privacyPolicyContact.phone;
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || privacyPolicyContact.email;

function validWebUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

export function hasApprovedPrivacyPolicy() {
  return privacyPolicyApproved;
}

function supportLinks() {
  const digits = SUPPORT_PHONE.replace(/\D/g, '');
  const phone = digits.length === 11 && /^[78]/.test(digits) ? `+7${digits.slice(1)}` : null;
  const email = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(SUPPORT_EMAIL) ? SUPPORT_EMAIL : null;
  const phoneDisplay = phone ? `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}` : null;
  return { phone, phoneDisplay, email };
}

// Only the privacy policy and the cafe's contacts: there are no separate order terms.
export default function AccountDocumentsScreen({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) setError(''); }, [visible]);
  const contacts = supportLinks();
  const approved = hasApprovedPrivacyPolicy();
  const approvedUrl = validWebUrl(PRIVACY_URL);
  const open = async url => {
    try { setError(''); await Linking.openURL(url); }
    catch { setError('Не удалось открыть ссылку. Попробуйте позже.'); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom }]}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingHorizontal: hPad }]}>
          <Text style={styles.title}>Политика и контакты</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть документы" style={styles.close}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator>
          {!approved && <View style={styles.notice}><Text style={styles.noticeTitle}>Черновик политики</Text><Text style={styles.copy}>Этот раздел ещё требует утверждения владельцем кофейни.</Text></View>}
          {approvedUrl && <TouchableOpacity onPress={() => open(approvedUrl)} accessibilityRole="link" style={styles.card}><Text style={styles.link}>Открыть политику на сайте</Text></TouchableOpacity>}
          {privacyPolicySections.map(({ title, paragraphs }) => <View key={title} style={styles.card}><Text style={styles.sectionTitle}>{title}</Text>{paragraphs.map((body, index) => <Text key={index} selectable style={styles.copy}>{body}</Text>)}</View>)}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Связаться с кофейней</Text>
            <Text style={styles.copy}>{privacyPolicyContact.name} · Томск, проспект Ленина, 72</Text>
            {contacts.phone && <TouchableOpacity onPress={() => open(`tel:${contacts.phone}`)} accessibilityRole="link" accessibilityLabel={`Позвонить в кофейню: ${contacts.phoneDisplay}`} style={styles.contact}><Text style={styles.link}>Позвонить: {contacts.phoneDisplay}</Text></TouchableOpacity>}
            {contacts.email && <TouchableOpacity onPress={() => open(`mailto:${contacts.email}`)} accessibilityRole="link" style={styles.contact}><Text style={styles.link}>Написать: {contacts.email}</Text></TouchableOpacity>}
            {!contacts.phone && !contacts.email && <Text style={styles.copy}>Контакты для связи ещё не опубликованы в приложении. Пока можно обратиться к сотруднику в кофейне.</Text>}
          </View>
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'flex-end' },
  screen: { width: '100%', maxWidth: 720, flex: 1, maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: radius.xlarge, borderTopRightRadius: radius.xlarge, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  title: { fontSize: 20, flex: 1, fontWeight: '800', color: colors.textPrimary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surfaceElevated, padding: spacing.lg, borderRadius: radius.large, marginBottom: spacing.md },
  notice: { backgroundColor: colors.accentSoft, padding: spacing.lg, borderRadius: radius.large, marginBottom: spacing.md },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: colors.accent },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  copy: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: spacing.sm },
  contact: { minHeight: 44, justifyContent: 'center', marginTop: spacing.sm },
  link: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.accent },
  error: { fontSize: 14, color: colors.danger, marginBottom: spacing.md },
});
