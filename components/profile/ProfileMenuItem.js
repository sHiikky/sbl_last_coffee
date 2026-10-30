// components/profile/ProfileMenuItem.js
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadow } from '../../theme/tokens';

export default function ProfileMenuItem({ icon, title, subtitle, onPress, badge }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      activeOpacity={0.6}
    >
      <Ionicons name={icon} size={22} color={colors.textPrimary} style={styles.icon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.07)',
    ...shadow.level1,
  },
  icon: { width: 23 },
  title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.accent },
});
