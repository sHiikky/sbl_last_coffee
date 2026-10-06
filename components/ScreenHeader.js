// Единый заголовок экрана (Меню / Корзина / Профиль): чёрный заголовок одного
// размера и с одним отступом сверху на всех экранах. Метка бренда и линия по
// умолчанию выключены — включаются пропсами showEyebrow / showLine.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useWindowDimensions } from 'react-native';
import HoloLine from './HoloLine';
import { colors, spacing, typography, getHorizontalPadding } from '../theme/tokens';

export default function ScreenHeader({ eyebrow = 'SBL', title, action, showLine = false, showEyebrow = false }) {
  const { width } = useWindowDimensions();
  const hPad = getHorizontalPadding(width);

  return (
    <View>
      <View style={[styles.row, { paddingHorizontal: hPad, paddingTop: spacing.md }]}>
        <View style={{ flex: 1 }}>
          {showEyebrow && <Text style={[typography.eyebrow, { color: colors.textMuted, marginBottom: spacing.xs }]}>{eyebrow}</Text>}
          <Text style={[typography.screenTitle, { color: colors.textPrimary, letterSpacing: -0.6 }]}>{title}</Text>
        </View>
        {action}
      </View>
      {showLine && <View style={{ height: spacing.md }} />}
      {showLine && <HoloLine marginHorizontal={hPad} height={5} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
});
