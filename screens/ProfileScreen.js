import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import ScreenHeader from '../components/ScreenHeader';
import DarkProfileCard from '../components/profile/DarkProfileCard';
import LoyaltyTeaser from '../components/profile/LoyaltyTeaser';
import ProfileMenuGroup from '../components/profile/ProfileMenuGroup';
import AuthPrompt from '../components/profile/AuthPrompt';
import { formatPhone } from './LoginScreen';
import { colors, radius, getHorizontalPadding, brand } from '../theme/tokens';
import { getDaysUntilNextMilestone } from '../loyalty/loyaltySelectors';
import { LOYALTY_CONFIG } from '../loyalty/loyaltyConfig';
import useBonusAccount from '../hooks/useBonusAccount';

export default function ProfileScreen({ navigation, tabBarHeight, favoriteIds = [], orderHistory = [], loyaltyState, account, onLogout }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);
  const isFocused = useIsFocused();

  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [fade, translateY]);

  const bonusAccount = useBonusAccount();

  const cycleLength = LOYALTY_CONFIG.cycleLength;
  const loyaltyCurrent = loyaltyState?.ready ? loyaltyState.cycleProgress.progress : 0;
  const remainingForGift = loyaltyState?.ready ? getDaysUntilNextMilestone(loyaltyState, LOYALTY_CONFIG) : cycleLength;

  const onMenuItemPress = () => {
    Haptics.selectionAsync();
  };

  const goToLoyalty = () => navigation.navigate('Loyalty');

  const handleLogout = () => {
    Haptics.selectionAsync();
    onLogout?.();
  };

  const goToLogin = () => navigation.navigate('Login');
  const goToOrderHistory = () => navigation.navigate('OrderHistory');
  const goToFavorites = () => navigation.navigate('Favorites');

  const menuItems = [
    { icon: 'cube-outline', title: 'Мои заказы', subtitle: 'История и статусы', onPress: goToOrderHistory },
    { icon: 'heart-outline', title: 'Избранное', subtitle: 'Сохранённые напитки', badge: favoriteIds.length || undefined, onPress: goToFavorites },
    { icon: 'notifications-outline', title: 'Уведомления', subtitle: 'Новинки и предложения', onPress: onMenuItemPress },
  ];

  return (
    <View style={styles.screen}>
      {isFocused && <StatusBar style="dark" />}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: tabBarHeight + insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {!account ? (
          // Без входа — только экран входа, ни карточки, ни меню.
          <AuthPrompt
            width={width}
            height={height - tabBarHeight - insets.top - insets.bottom}
            onPhone={goToLogin}
          />
        ) : (
        <>
        <ScreenHeader title="Профиль" />
        <Animated.View style={{ opacity: fade, transform: [{ translateY }], paddingHorizontal: hPad }}>
          <View style={{ marginTop: 20 }}>
            <DarkProfileCard
              name="Клиент SBL"
              email={formatPhone(account.phone)}
              status="STANDARD"
              avatarSource={null}
              bonuses={bonusAccount.balance}
              loyaltyCurrent={loyaltyCurrent}
              loyaltyTarget={cycleLength}
              ordersCount={orderHistory.length}
            />
          </View>

          <View style={{ marginTop: 15 }}>
            <LoyaltyTeaser
              currentStreak={loyaltyState?.currentStreak || 0}
              remaining={remainingForGift}
              onPress={goToLoyalty}
            />
          </View>

          <View style={{ marginTop: 18 }}>
            <ProfileMenuGroup items={menuItems} />
          </View>

          <View style={styles.accountActions}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Выйти из аккаунта"
              activeOpacity={0.75}
            >
              <Text style={styles.logoutText}>Выйти из аккаунта</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerSignature}>{brand.name} · {brand.tagline}</Text>
        </Animated.View>
        </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  accountActions: { marginTop: 24, alignItems: 'center' },
  logoutButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  footerSignature: {
    textAlign: 'center',
    marginTop: 28,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
