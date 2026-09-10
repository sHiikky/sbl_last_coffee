// navigation/TabIcons.js
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';

export function HomeIcon({ focused }) {
  return <TabIcon focused={focused} name={focused ? 'home' : 'home-outline'} />;
}
export function MenuIcon({ focused }) {
  return <TabIcon focused={focused} name={focused ? 'grid' : 'grid-outline'} />;
}
export function CartIcon({ focused, count }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Ionicons name={focused ? 'bag' : 'bag-outline'} size={22} color={focused ? colors.accent : '#B0AEA8'} />
      {count > 0 && (
        <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: colors.accent, borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  );
}
export function ProfileIcon({ focused }) {
  return <TabIcon focused={focused} name={focused ? 'person' : 'person-outline'} />;
}

function TabIcon({ focused, name }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Ionicons name={name} size={22} color={focused ? colors.accent : '#B0AEA8'} />
    </View>
  );
}
