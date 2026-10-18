// navigation/RoundedTabBar.js
// Нижняя панель на всю ширину, прижатая к низу экрана; скруглены только два
// верхних угла. Активная вкладка — оранжевые иконка и подпись, остальные серые.
// Подключается через `tabBar` в Tab.Navigator (App.js); иконки приходят из
// options.tabBarIcon({ focused, color }).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

export const TAB_BAR_HEIGHT = 66;
const TOP_RADIUS = 24;
const INACTIVE = '#8A8780';

export default function RoundedTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    // Подложка цвета страницы: за скруглёнными углами иначе виден стандартный
    // серый фон навигатора (светлее фона приложения) и выглядит «мутным» уголком.
    <View style={styles.backdrop}>
    <View style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: Math.max(insets.bottom, 4) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const color = focused ? colors.accent : INACTIVE;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={typeof label === 'string' ? label : undefined}
            style={styles.item}
          >
            {options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 22 }) : null}
            <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.background },
  bar: {
    flexDirection: 'row',
    paddingTop: 4,
    // Сплошной белый без тени: тень размазывалась серым пятном в скруглённых углах.
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
});
