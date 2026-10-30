// components/loyalty/LoyaltyRewardModal.js
// Celebratory-модалка, показывается один раз при первом достижении milestone
// (управляется из loyalty/useLoyaltyState.js -> celebratingReward). Сдержанно:
// без конфетти на весь экран и ярких spring-эффектов — лёгкий fade/scale,
// уважает Reduce Motion.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import Text from '../AppText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import HolographicSurface from '../HolographicSurface';
import PrimaryButton from '../PrimaryButton';
import { colors, spacing, radius, darkProfile } from '../../theme/tokens';

export default function LoyaltyRewardModal({ reward, onClaim, onDismiss }) {
  const visible = !!reward;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduceMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [visible, reduceMotion, opacity, scale]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <HolographicSurface variant="panel" intensity={0.5} animated={!reduceMotion} borderRadius={radius.xlarge} style={StyleSheet.absoluteFill} />

          <View style={styles.giftBadge}>
            <Ionicons name="gift" size={30} color="#fff" />
          </View>

          <Text style={styles.eyebrow}>{reward.sourceMilestone} дней подряд</Text>
          <Text style={styles.title}>Поздравляем!{'\n'}Вы получили награду</Text>
          <Text style={styles.rewardTitle}>{reward.title}</Text>

          <View style={{ marginTop: spacing.xl, width: '100%', gap: spacing.sm }}>
            <PrimaryButton label="Забрать награду" fullWidth haptic="light" onPress={onClaim} />
            <PrimaryButton label="Продолжить" fullWidth variant="silver" onPress={onDismiss} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xlarge,
    overflow: 'hidden',
    backgroundColor: darkProfile.surfaceElevated,
    alignItems: 'center',
    padding: spacing.xxl,
  },
  giftBadge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' },
  title: { fontSize: 19, fontWeight: '700', color: '#fff', textAlign: 'center', marginTop: spacing.sm, lineHeight: 25 },
  rewardTitle: { fontSize: 15, fontWeight: '600', color: colors.accent, marginTop: spacing.md, textAlign: 'center' },
});
