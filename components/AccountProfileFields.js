import React, { useState } from 'react';
import { View, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from './AppText';
import TextInput from './AppTextInput';
import { chooseLocalAvatar } from '../lib/localAvatar';
import { colors, radius, spacing } from '../theme/tokens';

export default function AccountProfileFields({ value, onChange, disabled = false }) {
  const [photoBusy, setPhotoBusy] = useState(false), [photoError, setPhotoError] = useState('');
  const pick = async () => {
    if (photoBusy || disabled) return;
    setPhotoBusy(true); setPhotoError('');
    try { const photo = await chooseLocalAvatar(); if (photo) onChange({ ...value, avatarUri: photo }); }
    catch (error) { setPhotoError(error.message || 'Не удалось открыть фотографии.'); }
    finally { setPhotoBusy(false); }
  };
  return <View style={styles.body}>
    <View style={styles.photoRow}>
      <TouchableOpacity onPress={pick} disabled={disabled || photoBusy} accessibilityRole="button" accessibilityLabel="Выбрать фотографию профиля" style={styles.avatar}>
        {value.avatarUri ? <Image source={{ uri: value.avatarUri }} style={styles.image} /> : <Ionicons name="person-outline" size={28} color={colors.textSecondary} />}
        {photoBusy && <View style={styles.photoLoading}><ActivityIndicator color={colors.accent} /></View>}
      </TouchableOpacity>
      <View style={styles.photoCopy}>
        <TouchableOpacity onPress={pick} disabled={disabled || photoBusy} accessibilityRole="button" style={styles.photoAction}><Text style={styles.photoTitle}>{value.avatarUri ? 'Изменить фото' : 'Добавить фото'}</Text></TouchableOpacity>
        <Text style={styles.photoHint}>Только на этом устройстве</Text>
        {!!value.avatarUri && <TouchableOpacity onPress={() => onChange({ ...value, avatarUri: null })} disabled={disabled} accessibilityRole="button" style={styles.remove}><Text style={styles.removeText}>Удалить фото</Text></TouchableOpacity>}
      </View>
    </View>
    {!!photoError && <Text style={styles.error} accessibilityRole="alert">{photoError}</Text>}
    <Text style={styles.label}>Имя</Text>
    <TextInput value={value.firstName} onChangeText={firstName => onChange({ ...value, firstName })} placeholder="Как к вам обращаться" placeholderTextColor={colors.textMuted} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" maxLength={60} editable={!disabled} style={styles.input} accessibilityLabel="Имя" />
    <Text style={styles.label}>Фамилия</Text>
    <TextInput value={value.lastName} onChangeText={lastName => onChange({ ...value, lastName })} placeholder="Ваша фамилия" placeholderTextColor={colors.textMuted} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" maxLength={60} editable={!disabled} style={styles.input} accessibilityLabel="Фамилия" />
  </View>;
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  photoLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  photoCopy: { flex: 1 }, photoAction: { minHeight: 32, justifyContent: 'center' },
  photoTitle: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  photoHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  remove: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' }, removeText: { color: colors.textSecondary, fontSize: 12 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  input: { minHeight: 54, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.medium, paddingHorizontal: spacing.lg, color: colors.textPrimary, fontSize: 16 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
