// components/ProductImage.js
// Единый компонент изображения товара.
// Пока нет фото — унифицированный silver placeholder с едва заметным SBL-водяным знаком,
// а не яркий emoji. Когда появится фото: передай source — placeholder исчезнет автоматически.
import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import HolographicSurface from './HolographicSurface';

const CATEGORY_ICON = {
  coffee: 'cafe-outline',
  alternative: 'leaf-outline',
  cold: 'snow-outline',
  food: 'restaurant-outline',
  coldCoffee: 'snow-outline',
  nonCoffee: 'color-filter-outline',
  warm: 'flame-outline',
  special: 'sparkles-outline',
  refresh: 'water-outline',
  dessert: 'ice-cream-outline',
  compliment: 'gift-outline',
};

// Градиенты режима transparent: те же элементы в дереве, но без заливки.
const CLEAR_GRADIENT_3 = ['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)'];
const CLEAR_GRADIENT_4 = ['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)'];

export default function ProductImage({
  source,
  category = 'coffee',
  aspectRatio = 1,
  borderRadius = 16,
  contentFit = 'contain',
  contentPosition = 'center',
  zoom = 1,
  // transparent — без подложки под фото: товар «висит» прямо на фоне
  // карточки, а заглушка рисуется приглушённым тёмным по светлому.
  transparent = false,
  style,
  accessibilityLabel,
}) {
  const [loading, setLoading] = useState(!!source);
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !source || failed;
  const iconName = CATEGORY_ICON[category] || 'cafe-outline';

  return (
    <View
      style={[styles.container, { aspectRatio, borderRadius, overflow: 'hidden' }, transparent && { backgroundColor: 'transparent' }, style]}
      accessibilityLabel={accessibilityLabel}
    >
      {showPlaceholder ? (
        <View style={styles.placeholder}>
          <LinearGradient
            colors={transparent ? CLEAR_GRADIENT_4 : ['#FFFFFF', '#F3F4F5', '#E2E5EA', '#F9FAFB']}
            locations={[0, 0.34, 0.72, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={transparent ? CLEAR_GRADIENT_3 : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)', 'rgba(12,12,12,0.035)']}
            locations={[0, 0.42, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {!transparent && (
            <HolographicSurface
              variant="segment"
              intensity={0.32}
              animated
              borderRadius={999}
              style={styles.placeholderGlint}
            />
          )}
          <Text style={[styles.monogram, transparent && { color: 'rgba(12,12,12,0.05)' }]}>SBL</Text>
          <View style={[styles.placeholderIcon, transparent && { backgroundColor: 'rgba(12,12,12,0.04)', borderColor: 'rgba(12,12,12,0.06)' }]}>
            <Ionicons name={iconName} size={30} color="rgba(12,12,12,0.28)" />
          </View>
        </View>
      ) : (
        <>
          <LinearGradient
            colors={transparent ? CLEAR_GRADIENT_3 : ['#FFFFFF', '#F3F1ED', '#E7E5DF']}
            locations={[0, 0.62, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Image
            source={source}
            style={[StyleSheet.absoluteFill, zoom !== 1 && { transform: [{ scale: zoom }] }]}
            contentFit={contentFit}
            contentPosition={contentPosition}
            transition={200}
            cachePolicy="memory-disk"
            onLoadEnd={() => setLoading(false)}
            onError={() => { setFailed(true); setLoading(false); }}
          />
          {loading && (
            <View style={[styles.loadingOverlay, transparent && { backgroundColor: 'transparent' }]}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#F4F2EE' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.62)' },
  placeholderGlint: {
    position: 'absolute',
    width: '62%',
    height: 14,
    top: '26%',
    right: '-18%',
    opacity: 0.46,
    transform: [{ rotate: '-14deg' }],
  },
  placeholderIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
  },
  monogram: {
    position: 'absolute',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(12,12,12,0.045)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(238,235,228,0.6)',
  },
});
