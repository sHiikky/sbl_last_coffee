// navigation/TabIcons.js
// Иконки нижней панели. Цвет приходит из RoundedTabBar (оранжевый у активной
// вкладки, серый у остальных).
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';

const DEFAULT_INACTIVE = '#8A8780';

export function HomeIcon({ focused, color }) {
  return <TabIcon focused={focused} color={color} name={focused ? 'home' : 'home-outline'} />;
}
export function MenuIcon({ focused, color }) {
  return <TabIcon focused={focused} color={color} name={focused ? 'grid' : 'grid-outline'} />;
}
export function CartIcon({ focused, color, count }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Ionicons name={focused ? 'bag' : 'bag-outline'} size={24} color={color || (focused ? colors.accent : DEFAULT_INACTIVE)} />
      {count > 0 && (
        <View style={{
          position: 'absolute', top: -5, right: -10,
          backgroundColor: colors.accent,
          borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 4,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  );
}
export function ProfileIcon({ focused, color }) {
  return <TabIcon focused={focused} color={color} name={focused ? 'person' : 'person-outline'} />;
}

function TabIcon({ focused, color, name }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Ionicons name={name} size={24} color={color || (focused ? colors.accent : DEFAULT_INACTIVE)} />
    </View>
  );
}
