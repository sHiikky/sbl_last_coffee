// components/profile/ProfileMenuGroup.js
// Каждый пункт — отдельная карточка с отступом (spacing.sm), а не строки
// внутри одного блока с разделителями — так пункты читаются как отдельные
// самостоятельные действия, а не как один сплошной список.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import ProfileMenuItem from './ProfileMenuItem';
import { spacing } from '../../theme/tokens';

export default function ProfileMenuGroup({ items }) {
  return (
    <View style={styles.wrap}>
      {items.map(item => (
        <ProfileMenuItem
          key={item.title}
          icon={item.icon}
          title={item.title}
          subtitle={item.subtitle}
          onPress={item.onPress}
          badge={item.badge}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
});
