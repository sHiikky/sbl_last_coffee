import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, Animated, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import Text from '../components/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import DarkProfileCard from '../components/profile/DarkProfileCard';
import LoyaltyTeaser from '../components/profile/LoyaltyTeaser';
import ProfileMenuGroup from '../components/profile/ProfileMenuGroup';
import PrimaryButton from '../components/PrimaryButton';
import AccountProfileFields from '../components/AccountProfileFields';
import { readLocalAvatar, writeLocalAvatar } from '../lib/localAvatar';
import { saveAccountProfile } from '../lib/accountProfile';
import AccountDocumentsScreen, { hasApprovedDocuments, hasApprovedPrivacyPolicy } from './AccountDocumentsScreen';
import NotificationSettingsScreen from './NotificationSettingsScreen';
import { formatPhone } from './LoginScreen';
import { colors, radius, spacing, brand } from '../theme/tokens';
import { getDaysUntilNextMilestone } from '../loyalty/loyaltySelectors';
import { LOYALTY_CONFIG } from '../loyalty/loyaltyConfig';
import useBonusAccount from '../hooks/useBonusAccount';
import { signOutAccount, requestAccountDeletion, fetchDeletionRequest, startYandexSignIn, describeAuthError, YANDEX_AUTH_ENABLED, WAITCALL_ENABLED } from '../lib/accountService';

function deletionError(error) {
  if (['PGRST202', '42883'].includes(error?.code)) return 'Приём запросов ещё не настроен. Обратитесь к сотруднику кофейни; запрос сейчас не был отправлен.';
  return 'Не удалось подтвердить запрос. Проверьте интернет и повторите попытку.';
}

export default function ProfileScreen({ navigation, tabBarHeight = 0, favoriteIds = [], orderHistory = [], loyaltyState, account, onLogout }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const bonusAccount = useBonusAccount();
  const fade = useRef(new Animated.Value(0)).current;
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [profile, setProfile] = useState({ firstName: '', lastName: '', avatarUri: null });
  const [savedName, setSavedName] = useState(null);
  useEffect(() => {
    let active = true;
    setAvatarUri(null); setSavedName(null); setEditorOpen(false);
    readLocalAvatar(account?.id).then(photo => { if (active) setAvatarUri(photo); }).catch(() => {});
    return () => { active = false; };
  }, [account?.id, isFocused]);
  const openEditor = () => {
    setProfile({ firstName: account?.firstName || '', lastName: account?.lastName || '', avatarUri });
    setEditorError(''); setEditorOpen(true);
  };
  const saveProfile = async () => {
    if (editorBusy || !account?.id) return;
    setEditorBusy(true); setEditorError('');
    try {
      const updated = await saveAccountProfile(account.id, profile);
      await writeLocalAvatar(account.id, profile.avatarUri);
      setAvatarUri(profile.avatarUri); setSavedName(updated.name); setEditorOpen(false);
    } catch { setEditorError('Не удалось сохранить профиль. Проверьте соединение и повторите.'); }
    finally { setEditorBusy(false); }
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [yandexBusy, setYandexBusy] = useState(false);
  const [yandexError, setYandexError] = useState('');
  const [yandexCardVisible, setYandexCardVisible] = useState(false);
  const canAttachYandex = !!account?.phone && !account.provider && YANDEX_AUTH_ENABLED;
  useEffect(() => {
    let active = true;
    setYandexCardVisible(false);
    if (account?.id) AsyncStorage.getItem(`sbl.hide-yandex-card:${account.id}`).then(hidden => {
      if (active) setYandexCardVisible(hidden !== 'true');
    }).catch(() => {});
    return () => { active = false; };
  }, [account?.id]);
  const showYandexCard = visible => {
    setYandexCardVisible(visible);
    if (account?.id) void AsyncStorage.setItem(`sbl.hide-yandex-card:${account.id}`, String(!visible)).catch(() => {});
  };
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletion, setDeletion] = useState(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const requestInFlight = useRef(false);

  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [fade]);
  useEffect(() => { setDeletion(null); setDeletionMessage(''); setDeletionOpen(false); }, [account?.id]);

  const cycleLength = LOYALTY_CONFIG.cycleLength;
  const current = loyaltyState?.ready ? loyaltyState.cycleProgress.progress : 0;
  const remaining = loyaltyState?.ready ? getDaysUntilNextMilestone(loyaltyState, LOYALTY_CONFIG) : cycleLength;

  // Phone account attaches Yandex to itself; the Auth listener in App.js refreshes the account afterwards.
  const attachYandex = async () => {
    if (yandexBusy) return;
    setYandexBusy(true); setYandexError('');
    try { await startYandexSignIn(); }
    catch (cause) { if (cause?.code !== 'YANDEX_CANCELLED') setYandexError(describeAuthError(cause)); }
    finally { setYandexBusy(false); }
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError('');
    try {
      const result = onLogout ? await onLogout() : await signOutAccount();
      if (result === false) throw new Error('Logout not confirmed');
    } catch { setLogoutError('Не удалось завершить выход. Проверьте интернет и повторите попытку.'); }
    finally { setLoggingOut(false); }
  };

  const openDeletion = async () => {
    setDeletionOpen(true); setDeletionMessage(''); setDeletionBusy(true);
    try { setDeletion(await fetchDeletionRequest()); }
    catch (cause) { setDeletionMessage(deletionError(cause)); }
    finally { setDeletionBusy(false); }
  };

  const confirmDeletion = async () => {
    if (requestInFlight.current || deletionBusy) return;
    requestInFlight.current = true;
    setDeletionBusy(true); setDeletionMessage('');
    try { setDeletion(await requestAccountDeletion()); }
    catch (cause) { setDeletionMessage(deletionError(cause)); }
    finally { requestInFlight.current = false; setDeletionBusy(false); }
  };

  const menuItems = [
    ...(canAttachYandex && !yandexCardVisible ? [{ icon: 'link-outline', title: 'Привязать Яндекс', subtitle: 'Дополнительный способ входа', onPress: () => showYandexCard(true) }] : []),
    ...(account ? [{ icon: 'person-outline', title: 'Редактировать профиль', subtitle: 'Имя и фото на этом устройстве', onPress: openEditor }] : []),
    { icon: 'cube-outline', title: 'Мои заказы', subtitle: 'История и статусы', onPress: () => navigation.navigate('OrderHistory') },
    { icon: 'heart-outline', title: 'Избранное', subtitle: 'Сохранённые товары', badge: favoriteIds.length || undefined, onPress: () => navigation.navigate('Favorites') },
    { icon: 'notifications-outline', title: 'Уведомления', subtitle: 'Заказы, акции, серия', onPress: () => setNotificationsOpen(true) },
    { icon: 'document-text-outline', title: 'Условия и связь', subtitle: hasApprovedDocuments() ? 'Предзаказ, данные и контакты кофейни' : hasApprovedPrivacyPolicy() ? 'Политика конфиденциальности и контакты' : 'Нужно заполнить перед запуском', onPress: () => setDocumentsOpen(true) },
  ];
  const requestPending = ['pending', 'processing'].includes(deletion?.status);
  const statusText = { pending: 'Запрос принят и ожидает обработки', processing: 'Запрос обрабатывается', completed: 'Запрос обработан', rejected: 'Нужны уточнения по запросу' }[deletion?.status];

  return <View style={styles.screen}>
    {isFocused && <StatusBar style="dark" />}
    <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: tabBarHeight + insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
      {/* Заголовок «Профиль» с равным воздухом сверху и снизу (20 px), чтобы не «склеивался» с карточкой. */}
      <View style={{ height: spacing.sm }} />
      <ScreenHeader title="Профиль" />
      <Animated.View style={[styles.body, { opacity: fade }]}>
        {account ? <DarkProfileCard name={savedName || account.name || 'Клиент SBL'} email={account.phone ? formatPhone(account.phone) : 'Вход через Яндекс'} status="STANDARD" avatarSource={avatarUri ? { uri: avatarUri } : null} bonuses={bonusAccount.balance} loyaltyCurrent={current} loyaltyTarget={cycleLength} ordersCount={orderHistory.length} /> : <View style={styles.card}>
          <Text style={styles.guestTitle}>Вы зашли как гость</Text>
          <Text style={styles.copy}>Заказы и бонусы связаны с текущей сессией устройства. Подтверждённый номер позволит входить в свой аккаунт на других телефонах.</Text>
          <View style={{ marginTop: spacing.lg }}><PrimaryButton label={YANDEX_AUTH_ENABLED ? 'Войти' : 'Войти по телефону'} onPress={() => navigation.navigate('Login')} fullWidth /></View>
        </View>}
        {account?.provider === 'yandex' && !account.phone && WAITCALL_ENABLED && <View style={[styles.card, { marginTop: spacing.lg }]}>
          <Text style={styles.guestTitle}>Подтвердите номер телефона</Text>
          <Text style={styles.copy}>Один звонок свяжет номер с аккаунтом Яндекса: так заказы и бонусы не потеряются при смене телефона.</Text>
          <View style={{ marginTop: spacing.lg }}><PrimaryButton label="Подтвердить номер" onPress={() => navigation.navigate('Login', { linkPhone: true })} fullWidth /></View>
        </View>}
        {canAttachYandex && yandexCardVisible && <View style={[styles.card, { marginTop: spacing.lg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text style={[styles.guestTitle, { flex: 1 }]}>Привязать Яндекс</Text>
            <TouchableOpacity onPress={() => showYandexCard(false)} accessibilityRole="button" accessibilityLabel="Скрыть карточку привязки Яндекса" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.actionText}>Скрыть</Text></TouchableOpacity>
          </View>
          <Text style={styles.copy}>Войдите в Яндекс один раз, и в этот аккаунт можно будет заходить и по номеру, и через Яндекс.</Text>
          {!!yandexError && <Text style={styles.error} accessibilityRole="alert">{yandexError}</Text>}
          <View style={{ marginTop: spacing.lg }}><PrimaryButton label="Привязать Яндекс" loading={yandexBusy} onPress={attachYandex} fullWidth /></View>
        </View>}
        <View style={{ marginTop: spacing.lg }}><LoyaltyTeaser currentStreak={loyaltyState?.currentStreak || 0} remaining={remaining} onPress={() => navigation.navigate('Loyalty')} /></View>
        <View style={{ marginTop: spacing.lg }}><ProfileMenuGroup items={menuItems} /></View>
        <View style={styles.actions}>
          {account && <TouchableOpacity onPress={logout} disabled={loggingOut} accessibilityRole="button" accessibilityLabel="Выйти из аккаунта" style={styles.action}>
            {loggingOut ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.actionText}>Выйти из аккаунта</Text>}
          </TouchableOpacity>}
          {!!logoutError && <Text style={styles.error} accessibilityRole="alert">{logoutError}</Text>}
          <TouchableOpacity onPress={openDeletion} disabled={deletionBusy} accessibilityRole="button" accessibilityLabel="Запросить удаление аккаунта и данных" style={styles.action}><Text style={styles.dangerText}>Запросить удаление {account ? 'аккаунта и данных' : 'данных гостя'}</Text></TouchableOpacity>
        </View>
        <Text style={styles.footerSignature}>{brand.name} · {brand.tagline}</Text>
      </Animated.View>
    </ScrollView>
    <AccountDocumentsScreen initialTab="privacy" visible={documentsOpen} onClose={() => setDocumentsOpen(false)} />
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => { if (!editorBusy) setEditorOpen(false); }}>
      <View style={styles.backdrop}><View style={[styles.dialog, { maxHeight: '92%' }]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.dialogTitle}>Ваш профиль</Text>
          <View style={{ marginVertical: spacing.lg }}><AccountProfileFields value={profile} onChange={setProfile} disabled={editorBusy} /></View>
          {!!editorError && <Text style={styles.error} accessibilityRole="alert">{editorError}</Text>}
          <PrimaryButton variant="holo" fullWidth label="Сохранить" onPress={saveProfile} loading={editorBusy} disabled={!profile.firstName.trim() || !profile.lastName.trim()} />
          <TouchableOpacity onPress={() => setEditorOpen(false)} disabled={editorBusy} accessibilityRole="button" style={styles.action}><Text style={styles.actionText}>Отмена</Text></TouchableOpacity>
        </ScrollView>
      </View></View>
    </Modal>
    <NotificationSettingsScreen visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    <Modal visible={deletionOpen} transparent animationType="fade" onRequestClose={() => { if (!deletionBusy) setDeletionOpen(false); }}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <Text style={styles.dialogTitle}>Запрос на удаление</Text>
        <Text style={styles.copy}>Отправим сотрудникам запрос на удаление аккаунта и связанных данных. Это не мгновенное удаление: пока запрос не обработан, аккаунт и история остаются доступны.</Text>
        <Text style={styles.copy}>Активные заказы этим действием не отменяются. Сотрудник должен проверить их и сведения, которые требуется сохранить в учёте.</Text>
        {deletionBusy && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />}
        {!!statusText && <Text style={styles.requestStatus}>{statusText}</Text>}
        {!!deletion?.active_order_count && <Text style={styles.copy}>Незавершённых заказов: {deletion.active_order_count}</Text>}
        {!!deletion?.public_message && <Text style={styles.copy}>{deletion.public_message}</Text>}
        {!!deletionMessage && <Text style={styles.error} accessibilityRole="alert">{deletionMessage}</Text>}
        {!requestPending && deletion?.status !== 'completed' && <View style={{ marginTop: spacing.xl }}><PrimaryButton fullWidth label="Подтвердить и отправить запрос" onPress={confirmDeletion} loading={deletionBusy} /></View>}
        <TouchableOpacity onPress={() => setDeletionOpen(false)} disabled={deletionBusy} accessibilityRole="button" style={styles.action}><Text style={styles.actionText}>{requestPending ? 'Закрыть' : 'Отмена'}</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  card: { padding: spacing.xl, backgroundColor: colors.surfaceElevated, borderRadius: radius.large },
  guestTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  copy: { fontSize: 14, lineHeight: 22, color: colors.textSecondary, marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xxl },
  action: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceElevated },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  dangerText: { fontSize: 14, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  error: { fontSize: 13, lineHeight: 20, color: colors.danger, marginTop: spacing.md },
  footerSignature: { textAlign: 'center', marginTop: spacing.xxl, fontSize: 12, color: colors.textMuted },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.borderOnDark },
  dialog: { width: '100%', maxWidth: 480, padding: spacing.xl, borderRadius: radius.xlarge, backgroundColor: colors.surfaceElevated },
  dialogTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  requestStatus: { fontSize: 15, fontWeight: '700', color: colors.success, marginTop: spacing.lg },
});
