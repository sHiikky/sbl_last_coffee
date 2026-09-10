// screens/OrderHistoryScreen.js
// Отдельный экран истории заказов — открывается из пункта "Мои заказы" в профиле.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OrderHistorySection from '../components/profile/OrderHistorySection';
import { colors, spacing, getHorizontalPadding } from '../theme/tokens';

export default function OrderHistoryScreen({ navigation, orderHistory = [], products = [], onRepeatOrder }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);

  const repeatAndOpenCart = (order) => {
    onRepeatOrder?.(order);
    navigation.navigate('Tabs', { screen: 'CartTab' });
  };

  const goToMenu = () => navigation.navigate('Tabs', { screen: 'MenuTab' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Мои заказы</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <OrderHistorySection orders={orderHistory} products={products} onRepeat={repeatAndOpenCart} onGoToMenu={goToMenu} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
});
