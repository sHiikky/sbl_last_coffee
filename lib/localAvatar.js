import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const keyFor = userId => `sbl.local-avatar.v1:${encodeURIComponent(userId)}`;
const MAX_DATA_LENGTH = 250000;

export async function readLocalAvatar(userId) {
  if (!userId) return null;
  const value = await AsyncStorage.getItem(keyFor(userId));
  return value?.startsWith('data:image/jpeg;base64,') && value.length <= MAX_DATA_LENGTH ? value : null;
}

export async function writeLocalAvatar(userId, value) {
  if (!userId) throw new Error('Сначала войдите в аккаунт.');
  if (!value) { await AsyncStorage.removeItem(keyFor(userId)); return; }
  if (!value.startsWith('data:image/jpeg;base64,') || value.length > MAX_DATA_LENGTH) throw new Error('Не удалось сохранить фотографию. Выберите другое изображение.');
  await AsyncStorage.setItem(keyFor(userId), value);
}

export async function chooseLocalAvatar() {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Разрешите доступ к фотографиям в настройках телефона.');
  }
  // On web this call stays in the button's user-activation chain.
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: Platform.OS !== 'web', aspect: [1, 1], quality: 0.9, exif: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > 20 * 1024 * 1024) throw new Error('Выберите фотографию размером до 20 МБ.');
  const actions = [];
  if (asset.width > 0 && asset.height > 0) {
    const side = Math.min(asset.width, asset.height);
    actions.push({ crop: { originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side } });
  }
  actions.push({ resize: { width: 320, height: 320 } });
  const resized = await ImageManipulator.manipulateAsync(asset.uri, actions, { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!resized.base64) throw new Error('Не удалось обработать фотографию. Попробуйте другую.');
  const value = `data:image/jpeg;base64,${resized.base64}`;
  if (value.length > MAX_DATA_LENGTH) throw new Error('Не удалось уменьшить фотографию. Попробуйте другую.');
  return value;
}
