import React, { useEffect, useState } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, getHorizontalPadding } from '../theme/tokens';
import { privacyPolicySections, privacyPolicyApproved, privacyPolicyContact } from '../data/privacyPolicy';

const APPROVED = process.env.EXPO_PUBLIC_LEGAL_DOCUMENTS_APPROVED === 'true';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || privacyPolicyContact.phone;
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || privacyPolicyContact.email;

function validWebUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

export function hasApprovedDocuments() {
  return APPROVED && !!validWebUrl(TERMS_URL) && hasApprovedPrivacyPolicy();
}

export function hasApprovedPrivacyPolicy() {
  return privacyPolicyApproved || (APPROVED && !!validWebUrl(PRIVACY_URL));
}

function supportLinks() {
  const digits = SUPPORT_PHONE.replace(/\D/g, '');
  const phone = digits.length === 11 && /^[78]/.test(digits) ? `+7${digits.slice(1)}` : null;
  const email = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(SUPPORT_EMAIL) ? SUPPORT_EMAIL : null;
  const phoneDisplay = phone ? `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}` : null;
  return { phone, phoneDisplay, email };
}

const sections = {
  terms: [
    ['Как работает предзаказ', 'Выберите товары и добавки, проверьте итоговую сумму и отправьте заказ. Обработка заказа и его статус отображаются в приложении.'],
    ['Самовывоз и оплата', 'Заказ нужно забрать в кофейне SBL: Томск, проспект Ленина, 72. Оплата производится при получении в кофейне. В приложении онлайн-оплаты нет.'],
    ['Время работы', 'Кофейня работает с 11:00 до 20:00 по времени Томска. Обычное время приготовления — 3–5 минут; фактическая готовность зависит от загрузки. Ориентируйтесь на статус заказа.'],
    ['Изменение и отмена', 'Если нужно изменить или отменить уже отправленный заказ, свяжитесь с кофейней. Статус «Выдан» означает, что заказ завершён сотрудником.'],
    ['Бонусы и подарки', 'Доступный баланс, награды и окончательная сумма подтверждаются при оформлении. Начисление за покупку происходит после завершения заказа.'],
  ],

};

export default function AccountDocumentsScreen({ visible, onClose, initialTab = 'terms' }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) { setTab(initialTab); setError(''); } }, [visible, initialTab]);
  const contacts = supportLinks();
  const approved = tab === 'privacy' ? hasApprovedPrivacyPolicy() : APPROVED && !!validWebUrl(TERMS_URL);
  const approvedUrl = approved ? validWebUrl(tab === 'terms' ? TERMS_URL : PRIVACY_URL) : null;
  const open = async url => {
    try { setError(''); await Linking.openURL(url); }
    catch { setError('Не удалось открыть ссылку. Попробуйте позже.'); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom }]}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingHorizontal: hPad }]}>
          <Text style={styles.title}>{tab === 'privacy' ? 'Конфиденциальность' : 'Условия и связь'}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть документы" style={styles.close}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView key={tab} contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator>
          <View style={styles.tabs}>
            {[['terms', 'Предзаказ'], ['privacy', 'Политика']].map(([id, label]) => <TouchableOpacity key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={[styles.tab, tab === id && styles.selected]}><Text style={[styles.tabText, tab === id && styles.selectedText]}>{label}</Text></TouchableOpacity>)}
          </View>
          {!approved && <View style={styles.notice}><Text style={styles.noticeTitle}>{tab === 'terms' ? 'Черновик условий предзаказа' : 'Черновик политики'}</Text><Text style={styles.copy}>Этот раздел ещё требует утверждения владельцем кофейни.</Text></View>}
          {approvedUrl && <TouchableOpacity onPress={() => open(approvedUrl)} accessibilityRole="link" style={styles.card}><Text style={styles.link}>Открыть утверждённый документ</Text></TouchableOpacity>}
          {tab === 'privacy' ? privacyPolicySections.map(({ title, paragraphs }) => <View key={title} style={styles.card}><Text style={styles.sectionTitle}>{title}</Text>{paragraphs.map((body, index) => <Text key={index} selectable style={styles.copy}>{body}</Text>)}</View>) : sections.terms.map(([title, body]) => <View key={title} style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.copy}>{body}</Text></View>)}
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
  backdrop: { flex: 1, backgroundColor: 'rgba(20,24,20,0.4)', alignItems: 'center', justifyContent: 'flex-end' },
  screen: { width: '100%', maxWidth: 720, flex: 1, maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: radius.xlarge, borderTopRightRadius: radius.xlarge, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  title: { fontSize: 20, flex: 1, fontWeight: '800', color: colors.textPrimary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  selected: { backgroundColor: colors.darkSurface },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  selectedText: { color: colors.textOnDark },
  card: { backgroundColor: colors.surfaceElevated, padding: spacing.lg, borderRadius: radius.large, marginBottom: spacing.md },
  notice: { backgroundColor: colors.accentSoft, padding: spacing.lg, borderRadius: radius.large, marginBottom: spacing.md },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: colors.accent },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  copy: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: spacing.sm },
  contact: { minHeight: 44, justifyContent: 'center', marginTop: spacing.sm },
  link: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.accent },
  error: { fontSize: 14, color: colors.danger, marginBottom: spacing.md },
});
