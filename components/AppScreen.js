// components/AppScreen.js
// Единая обёртка экрана: safe area, фон, опциональный скролл,
// нижний паддинг под tab bar / sticky CTA.
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

export default function AppScreen({
  children,
  scroll = true,
  dark = false,
  bottomInset = 0,       // высота tab bar / CTA, чтобы контент не прятался под ними
  contentContainerStyle,
  style,
}) {
  const insets = useSafeAreaInsets();
  const bg = dark ? colors.darkSurface : colors.background;

  const paddingBottom = (bottomInset || insets.bottom) + 16;

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: bg, paddingTop: insets.top }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: bg }, style]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: insets.top, paddingBottom }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}
