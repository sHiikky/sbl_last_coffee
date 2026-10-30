// components/EmptyState.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme/tokens';

export default function EmptyState({ icon = 'cafe-outline', title, subtitle, action }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={34} color={colors.textMuted} />
      </View>
      <Text style={[typography.cardTitle, { fontSize: 17, color: colors.textPrimary, marginBottom: spacing.xs }]}>{title}</Text>
      <Text style={[typography.caption, styles.subtitle]}>{subtitle}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 40 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#F0EDE6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  subtitle: { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl, lineHeight: 19, maxWidth: 240 },
});
