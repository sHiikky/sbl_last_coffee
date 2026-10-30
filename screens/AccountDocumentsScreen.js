import React, { useEffect, useState } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import Text from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, getHorizontalPadding } from '../theme/tokens';

const APPROVED = process.env.EXPO_PUBLIC_LEGAL_DOCUMENTS_APPROVED === 'true';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || '';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '';

function validWebUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

export function hasApprovedDocuments() {
  return APPROVED && !!validWebUrl(TERMS_URL) && !!validWebUrl(PRIVACY_URL);
}

function supportLinks() {
  const digits = SUPPORT_PHONE.replace(/\D/g, '');
  const phone = digits.length === 11 && /^[78]/.test(digits) ? `+7${digits.slice(1)}` : null;
  const email = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(SUPPORT_EMAIL) ? SUPPORT_EMAIL : null;
  return { phone, email };
}

const sections = {
  terms: [
    ['Как работает предзаказ', 'Выберите товары и добавки, проверьте итоговую сумму и отправьте заказ. Обработка заказа и его статус отображаются в приложении.'],
    ['Самовывоз и оплата', 'Заказ нужно забрать в кофейне SBL: Томск, проспект Ленина, 72. Оплата производится при получении в кофейне. В приложении онлайн-оплаты нет.'],
    ['Время работы', 'Кофейня работает с 11:00 до 20:00 по времени Томска. Обычное время приготовления — 3–5 минут; фактическая готовность зависит от загрузки. Ориентируйтесь на статус заказа.'],
    ['Изменение и отмена', 'Если нужно изменить или отменить уже отправленный заказ, свяжитесь с кофейней. Статус «Выдан» означает, что заказ завершён сотрудником.'],
    ['Бонусы и подарки', 'Доступный баланс, награды и окончательная сумма подтверждаются при оформлении. Начисление за покупку происходит после завершения заказа.'],
  ],
  privacy: [
    ['Какие сведения нужны', 'Для обработки заказа используются состав, количество, стоимость, статусы, введённые имя и контактный телефон. Номер для связи с заказом сам по себе не подтверждает владение номером.'],
    ['Вход по телефону', 'Подтверждение номера выполняется кодом СМС после подключения сервиса отправки. Код проверяет сервер. В гостевом режиме данные относятся к текущей сессии устройства; вход в существующий аккаунт не переносит гостевые заказы автоматически.'],
    ['Хранение и доступ', 'Данные заказов, бонусов и аккаунта обрабатываются в серверном сервисе приложения на Supabase. Заказы доступны соответствующему пользователю и сотрудникам кофейни в пределах назначенных прав. Корзина, избранное и часть кэша хранятся на устройстве.'],
    ['Уведомления', 'При включении уведомлений сохраняется адрес доставки сообщений этого устройства. Уведомления о статусе заказа передаются через Expo Push Service и службы платформы телефона. Их можно отключить в профиле или настройках телефона.'],
    ['Запрос на удаление', 'В профиле можно отправить запрос на удаление аккаунта и данных. Это запрос на обработку, а не мгновенное удаление. Он не отменяет активные заказы. Состав сохраняемых сведений и сроки должен подтвердить владелец кофейни.'],
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
  const approved = hasApprovedDocuments();
  const approvedUrl = approved ? validWebUrl(tab === 'terms' ? TERMS_URL : PRIVACY_URL) : null;
  const open = async url => {
    try { setError(''); await Linking.openURL(url); }
    catch { setError('Не удалось открыть ссылку. Попробуйте позже.'); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { paddingHorizontal: hPad }]}>
          <Text style={styles.title}>Условия и связь</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть документы" style={styles.close}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: spacing.xxl }}>
          <View style={styles.tabs}>
            {[['terms', 'Предзаказ'], ['privacy', 'Данные']].map(([id, label]) => <TouchableOpacity key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={[styles.tab, tab === id && styles.selected]}><Text style={[styles.tabText, tab === id && styles.selectedText]}>{label}</Text></TouchableOpacity>)}
          </View>
          {!approved && <View style={styles.notice}><Text style={styles.noticeTitle}>Нужно заполнить перед запуском</Text><Text style={styles.copy}>Пока это проект сведений. Владелец кофейни должен утвердить документы, указать оператора данных, реквизиты, контакты и сроки хранения. Этот текст не заменяет утверждённую политику и условия.</Text></View>}
          {approvedUrl && <TouchableOpacity onPress={() => open(approvedUrl)} accessibilityRole="link" style={styles.card}><Text style={styles.link}>Открыть утверждённый документ</Text></TouchableOpacity>}
          {sections[tab].map(([title, body]) => <View key={title} style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.copy}>{body}</Text></View>)}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Связаться с кофейней</Text>
            <Text style={styles.copy}>SBL · Томск, проспект Ленина, 72</Text>
            {contacts.phone && <TouchableOpacity onPress={() => open(`tel:${contacts.phone}`)} accessibilityRole="link" style={styles.contact}><Text style={styles.link}>Позвонить: {contacts.phone}</Text></TouchableOpacity>}
            {contacts.email && <TouchableOpacity onPress={() => open(`mailto:${contacts.email}`)} accessibilityRole="link" style={styles.contact}><Text style={styles.link}>Написать: {contacts.email}</Text></TouchableOpacity>}
            {!contacts.phone && !contacts.email && <Text style={styles.copy}>Контакты для связи ещё не опубликованы в приложении. Пока можно обратиться к сотруднику в кофейне.</Text>}
          </View>
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  title: { fontSize: 23, fontWeight: '800', color: colors.textPrimary },
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
