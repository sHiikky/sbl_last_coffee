import React from 'react';
import { View, Pressable, ScrollView, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from '../AppText';
import HoloLine from '../HoloLine';
import { colors, radius, spacing } from '../../theme/tokens';

export default function DrinkAnnouncement({ item, products, onOpenProduct }) {
  const drinks = item.productIds.map(id => products.find(product => product.id === id)).filter(Boolean);
  if (!drinks.length) return null;
  return <View style={styles.card}>
    <HoloLine height={3} marginHorizontal={0} />
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>НОВОЕ В SBL</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drinks}>
      {drinks.map(product => <Pressable key={product.id} onPress={() => onOpenProduct?.(product)} accessibilityRole="button"
        accessibilityLabel={`Посмотреть ${product.displayName || product.name}`} style={({pressed}) => [styles.drink, pressed && {opacity:0.7}]}>
        {product.image && <Image source={product.image} style={styles.photo} resizeMode="contain" />}
        <Text style={styles.name} numberOfLines={2}>{product.displayName || product.name}</Text>
        <View style={styles.link}><Text style={styles.linkText}>В меню</Text><Ionicons name="arrow-forward" size={14} color={colors.accent}/></View>
      </Pressable>)}
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
  card:{backgroundColor:colors.surfaceElevated,borderRadius:radius.large,overflow:'hidden',marginBottom:spacing.lg},
  copy:{padding:spacing.lg,paddingBottom:spacing.md},
  eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.2,color:colors.accent,marginBottom:8},
  title:{fontSize:23,lineHeight:28,fontWeight:'700',color:colors.textPrimary,marginBottom:8},
  body:{fontSize:14,lineHeight:21,color:colors.textSecondary},
  drinks:{paddingHorizontal:spacing.lg,paddingBottom:spacing.lg,gap:12},
  drink:{width:136,padding:12,borderRadius:16,backgroundColor:colors.surface2},
  photo:{width:'100%',height:110},
  name:{fontSize:13,lineHeight:18,fontWeight:'600',color:colors.textPrimary,minHeight:36,marginTop:8},
  link:{flexDirection:'row',alignItems:'center',gap:6,marginTop:10},linkText:{fontSize:12,fontWeight:'600',color:colors.accent},
});
