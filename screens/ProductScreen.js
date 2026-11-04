import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Platform, Share, StyleSheet, Animated, Easing, useWindowDimensions, KeyboardAvoidingView, Keyboard, PanResponder, BackHandler } from 'react-native';
import Text from '../components/AppText';
import TextInput from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ProductGlass from '../components/ProductGlass';
import ProductAtmosphere from '../components/ProductAtmosphere';
import ProductSheetPhoto from '../components/ProductSheetPhoto';
import HolographicSurface from '../components/HolographicSurface';
import { colors, spacing, radius, typography, getHorizontalPadding } from '../theme/tokens';
import { productSheet as material } from '../theme/productSheet';
import { formatPrice, cartKey } from '../data/products';
import { canonicalModifiers, additionsTotal, formatAdditions, isModifierAllowed } from '../lib/cartOptions';
import { getPhotoComposition } from '../lib/photoComposition';
import { getProductVisual } from '../lib/productVisuals';
import { productVariants, productSheetHeight, availableProductQuantity, changeAdditionCount } from '../lib/productSheetModel';
import { shareProduct } from '../lib/productLinks';
import useMotionPreference from '../hooks/useMotionPreference';
import { groupModifiers } from '../lib/modifierGroups';
import { presentAdditions, isAltMilk } from '../lib/additionsPresentation';

export default function ProductScreen({ route, navigation, cart = {}, products = [], modifiers = [], onAddToCart, onToggleFavorite, favoriteIds = [] }) {
  const openedProduct=route.params.product;
  const [selectedId,setSelectedId]=useState(openedProduct.id);
  const variants=useMemo(()=>productVariants(products,openedProduct),[products,openedProduct]);
  const product=variants.find(p=>p.id===selectedId)||openedProduct;
  const isAvailable=products.some(p=>p.id===product.id&&p.isAvailable!==false);
  const {width,height}=useWindowDimensions(),insets=useSafeAreaInsets();
  const hPad=getHorizontalPadding(width),sheetHeight=productSheetHeight(height,insets.top);
  const {reduceMotion,ready:motionReady}=useMotionPreference();
  const [additionCounts,setAdditionCounts]=useState({}),[requestedQuantity,setRequestedQuantity]=useState(1);
  const [selectedGroup,setSelectedGroup]=useState(null),[commentOpen,setCommentOpen]=useState(false);
  const scrollRef=useRef(null),noteFocused=useRef(false);
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  const [preparationNote,setPreparationNote]=useState(''),[notice,setNotice]=useState(''),[added,setAdded]=useState(false);
  const additions=useMemo(()=>presentAdditions(product,modifiers).filter(m=>isModifierAllowed(product,m.id)),[product,modifiers]);
  const groups=useMemo(()=>groupModifiers(additions),[additions]);
  const activeGroup=groups.find(g=>g.id===selectedGroup)||groups[0];
  const selectedModifiers=canonicalModifiers(additions.filter(m=>additionCounts[m.id]>0).map(m=>({id:m.id,name:m.displayName||m.name,quantity:additionCounts[m.id],unitPrice:m.price})));
  const unavailableAdditions=Object.keys(additionCounts).filter(id=>additionCounts[id]>0&&(!isModifierAllowed(product,id)||!modifiers.some(m=>m.id===id&&m.isAvailable!==false)));
  const selectedKey=cartKey(product.id,selectedModifiers,preparationNote),inCart=cart[selectedKey]?.qty||0;
  const capacity=availableProductQuantity(inCart),quantity=Math.min(requestedQuantity,Math.max(1,capacity));
  const extras=additionsTotal(selectedModifiers),unitPrice=Math.round((product.price+extras)*100)/100,total=Math.round(unitPrice*quantity*100)/100;
  const visual=getProductVisual(product),frame=getPhotoComposition(product,'detail');
  const favorite=favoriteIds.includes(product.id),name=product.displayName||product.name;
  const closing=useRef(false),submitted=useRef(false),mounted=useRef(true),shareBusy=useRef(false),entered=useRef(false);
  const translate=useRef(new Animated.Value(sheetHeight)).current,closeRef=useRef(null),sheetRef=useRef(null),closeButton=useRef(null);
  const titleId='product-'+openedProduct.id;
  const close=useCallback((delay=0)=>{
    if(closing.current)return;
    closing.current=true;
    Animated.timing(translate,{toValue:sheetHeight,duration:reduceMotion?0:240,delay:reduceMotion?0:delay,easing:Easing.in(Easing.cubic),useNativeDriver:true}).start(({finished})=>{
      if(finished&&mounted.current)navigation.goBack();
    });
  },[navigation,translate,sheetHeight,reduceMotion]);
  closeRef.current=close;
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;translate.stopAnimation();};
  },[translate]);
  useEffect(()=>{
    if(!motionReady||entered.current||closing.current)return undefined;
    entered.current=true;
    const animation=Animated.timing(translate,{toValue:0,duration:reduceMotion?0:340,easing:Easing.out(Easing.cubic),useNativeDriver:true});
    animation.start();
    return()=>animation.stop();
  },[translate,motionReady,reduceMotion]);
  useEffect(()=>{if(motionReady&&reduceMotion&&!closing.current){translate.stopAnimation();translate.setValue(0);}},[motionReady,reduceMotion,translate]);
  useFocusEffect(useCallback(()=>{
    const sub=BackHandler.addEventListener('hardwareBackPress',()=>{closeRef.current();return true;});
    return()=>sub.remove();
  },[]));
  useEffect(()=>{
    if(Platform.OS!=='web')return undefined;
    const previous=document.activeElement;
    const frameId=requestAnimationFrame(()=>closeButton.current?.focus?.());
    const onKey=event=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();return;}
      if(event.key!=='Tab')return;
      const controls=[...(sheetRef.current?.querySelectorAll?.('button,input,textarea,[tabindex]')||[])].filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.tabIndex>=0&&el.getClientRects().length);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(!sheetRef.current?.contains?.(document.activeElement)){event.preventDefault();first.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey);
    return()=>{cancelAnimationFrame(frameId);document.removeEventListener('keydown',onKey);if(previous?.isConnected)previous.focus?.();};
  },[]);
  useEffect(()=>{
    if(Platform.OS==='web')return undefined;
    const show=Keyboard.addListener('keyboardDidShow',()=>{setKeyboardOpen(true);if(noteFocused.current)scrollRef.current?.scrollToEnd({animated:true});});
    const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboardOpen(false));
    return()=>{show.remove();hide.remove();};
  },[]);
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>!closing.current&&g.dy>6&&Math.abs(g.dy)>Math.abs(g.dx),
    onPanResponderMove:(_,g)=>{if(!closing.current)translate.setValue(Math.max(0,g.dy));},
    onPanResponderRelease:(_,g)=>{
      if(g.dy>75||g.vy>1.2){closeRef.current();return;}
      if(!closing.current){if(reduceMotion)translate.setValue(0);else Animated.spring(translate,{toValue:0,useNativeDriver:true,damping:24,stiffness:250,mass:1}).start();}
    },
    onPanResponderTerminate:()=>{if(!closing.current)translate.setValue(0);},
  }),[translate,reduceMotion]);
  const handleShare=async()=>{
    if(shareBusy.current)return;shareBusy.current=true;
    try{
      const result=await shareProduct(product,{platform:Platform.OS,webOrigin:Platform.OS==='web'?window.location.href:null,
        copy:Platform.OS==='web'&&typeof navigator.clipboard?.writeText==='function'?value=>navigator.clipboard.writeText(value):null,share:payload=>Share.share(payload)});
      if(mounted.current)setNotice(result.copied?'Ссылка на напиток скопирована':'Ссылка на напиток готова к отправке');
    }catch(_){if(mounted.current)setNotice('Не удалось отправить ссылку. Попробуйте ещё раз.');}
    finally{shareBusy.current=false;}
  };
  const handleAdd=()=>{
    if(submitted.current||closing.current||!isAvailable||unavailableAdditions.length||!capacity)return;
    submitted.current=true;
    try{
      const result=typeof onAddToCart==='function'?onAddToCart(product,selectedModifiers,preparationNote,quantity):false;
      if(result==='auth'){submitted.current=false;return;}
      if(result===false){
        submitted.current=false;setNotice('Состав или наличие изменились. Проверьте выбранные добавки.');return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
      setAdded(true);close(140);
    }catch(_){submitted.current=false;setNotice('Не удалось добавить позицию. Проверьте состав и пожелание.');}
  };
  // Альтернативное молоко (кокосовое / миндальное / безлактозное): в напитке только одно.
  const adjust=(id,delta)=>setAdditionCounts(previous=>{
    if(delta>0&&additions.find(m=>m.id===id)?.altMilk){const next={...previous};additions.forEach(m=>{if(m.altMilk)next[m.id]=0;});next[id]=1;return next;}
    return changeAdditionCount(previous,id,delta);
  });
  const disabled=!isAvailable||unavailableAdditions.length>0||capacity===0||added;
  const tileWidth=Math.max(150,Math.min(190,(Math.min(width,600)-hPad*2-12)/2));
  const photoHeight=height<700?148:184;
  const groupCount=group=>group.items.reduce((sum,m)=>sum+(additionCounts[m.id]||0),0);
  const ingredient=activeGroup?.id==='milk'?['#FFFDF5','#D1B890']:activeGroup?.id==='syrup'?['#F2CF87','#AA561B']:['#E6D5BC','#A18B6D'];
  return <View style={styles.overlay}>
    <StatusBar style="light" />
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:material.scrim,opacity:translate.interpolate({inputRange:[0,Math.max(1,sheetHeight)],outputRange:[1,0],extrapolate:'clamp'})}]} />
    <Pressable style={StyleSheet.absoluteFill} onPress={()=>close()} accessibilityLabel="Закрыть карточку" accessibilityRole="button" {...(Platform.OS==='web'?{tabIndex:-1}:{accessible:false})} />
    <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined} style={styles.keyboard}>
      <Animated.View ref={sheetRef} accessibilityViewIsModal {...(Platform.OS==='web'?{role:'dialog','aria-modal':true,'aria-labelledby':titleId}:{})} style={[styles.sheet,{height:sheetHeight,transform:[{translateY:translate}]}]}>
        <ProductAtmosphere visual={visual} source={product.image} />
        <View style={styles.header}>
          <Pressable {...pan.panHandlers} onPress={()=>close()} style={styles.handle} accessibilityRole="button" accessibilityLabel="Свернуть карточку"><View style={styles.handleLine}/></Pressable>
          <View style={styles.headerActions}><Pressable onPress={handleShare} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Поделиться"><Ionicons name="share-outline" size={19} color={material.text}/></Pressable><Pressable ref={closeButton} onPress={()=>close()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Закрыть карточку товара"><Ionicons name="close" size={21} color={material.text}/></Pressable></View>
        </View>
        <ScrollView ref={scrollRef} onContentSizeChange={()=>{if(noteFocused.current)scrollRef.current?.scrollToEnd({animated:true});}} style={styles.scroll} contentContainerStyle={{paddingHorizontal:hPad,paddingBottom:spacing.lg}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.hero}>
            <Text style={styles.kicker}>{['SBL',product.menuSubcategory,product.sizeLabel].filter(Boolean).join(' · ')}</Text>
            <View style={styles.photo}><ProductSheetPhoto product={product} visual={visual} frame={frame} height={photoHeight}/></View>
            <Pressable onPress={()=>onToggleFavorite?.(product.id)} style={styles.favorite} accessibilityRole="button" accessibilityLabel={favorite?'Убрать из избранного':'Добавить в избранное'} accessibilityState={{selected:favorite}}><Ionicons name={favorite?'heart':'heart-outline'} size={21} color={material.text}/></Pressable>
            <Text nativeID={titleId} accessibilityRole="header" style={styles.name}>{name}</Text>
            {!!product.description&&<Text style={styles.description}>{product.description}</Text>}
            {!!product.ingredients&&<Text style={styles.description}>Состав: {product.ingredients}</Text>}
            {!!product.allergens&&<Text style={styles.description}>Аллергены: {product.allergens}</Text>}
            {!!product.nutrition&&product.nutritionBasis!=='unknown'&&<Text style={styles.small}>{({portion:'На порцию','100g':'На 100 г','100ml':'На 100 мл'})[product.nutritionBasis]}</Text>}
            {!!product.nutrition&&<View style={styles.nutrition}>{[['Ккал','calories'],['Белки','protein'],['Жиры','fat'],['Углеводы','carbs']].map(([label,key])=>product.nutrition[key]!=null&&<View key={key}><Text style={styles.nutritionValue}>{product.nutrition[key]}{key==='calories'?'':' г'}</Text><Text style={styles.small}>{label}</Text></View>)}</View>}
          </View>
          {!!notice&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          {!isAvailable&&<Text style={styles.notice}>Эта позиция сейчас недоступна.</Text>}
          {unavailableAdditions.length>0&&<ProductGlass style={styles.warning}><Text style={styles.lightText}>Часть выбранных добавок закончилась. Проверьте состав.</Text><Pressable onPress={()=>setAdditionCounts(prev=>Object.fromEntries(Object.entries(prev).filter(([id])=>!unavailableAdditions.includes(id))))} accessibilityRole="button" style={styles.textAction}><Text style={styles.lightText}>Убрать недоступные добавки</Text></Pressable></ProductGlass>}
          {variants.length>1&&<View style={styles.block}><Text style={styles.blockTitle}>Объём</Text><View style={styles.variants}>{variants.map(variant=><Pressable key={variant.id} onPress={()=>{if(!reduceMotion)void Haptics.selectionAsync().catch(()=>{});setSelectedId(variant.id);setNotice('');setAdditionCounts(c=>Object.fromEntries(Object.entries(c).filter(([id])=>!modifiers.some(m=>m.id===id&&isAltMilk(m)))));}} accessibilityRole="button" accessibilityLabel={`Объём ${variant.sizeLabel||'стандартный'}, ${formatPrice(variant.price)}`} accessibilityState={{selected:variant.id===product.id}}><ProductGlass selected={variant.id===product.id} style={styles.variant}><Text style={styles.lightText}>{variant.sizeLabel||'Стандарт'}</Text><Text style={styles.small}>{formatPrice(variant.price)}</Text></ProductGlass></Pressable>)}</View></View>}
          {variants.length<2&&product.menuVolumes?.length>1&&<Text style={styles.small}>Объёмы из меню: {product.menuVolumes.join(' / ')} мл</Text>}
          {groups.length>0&&<View style={styles.block}>
            <View style={styles.sectionHeading}><Text style={styles.blockTitle}>Сделать по-своему</Text><Text style={styles.small}>Добавки на порцию</Text></View>
            {groups.length>1&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupTabs}>{groups.map(group=><Pressable key={group.id} onPress={()=>setSelectedGroup(group.id)} style={[styles.groupTab,activeGroup?.id===group.id&&styles.groupTabActive]} accessibilityRole="button" accessibilityLabel={group.title} accessibilityState={{selected:activeGroup?.id===group.id}}><Text style={styles.groupTabText}>{group.title}{groupCount(group)>0?` · ${groupCount(group)}`:''}</Text></Pressable>)}</ScrollView>}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} accessibilityLabel={`Добавки: ${activeGroup?.title}`}>
              {activeGroup?.items.map(addition=>{const count=additionCounts[addition.id]||0;const atLimit=count>=(addition.altMilk?1:10)||(!count&&selectedModifiers.length>=20);return <ProductGlass key={addition.id} selected={count>0} style={[styles.tile,{width:tileWidth}]}>
                <LinearGradient colors={ingredient} start={{x:.2,y:0}} end={{x:.9,y:1}} style={styles.ingredient}><Ionicons name={activeGroup.id==='milk'?'water-outline':activeGroup.id==='syrup'?'color-fill-outline':'add-outline'} size={18} color="rgba(52,34,18,0.62)"/></LinearGradient>
                <Text numberOfLines={2} style={styles.additionName}>{addition.displayName||addition.name}</Text><Text style={styles.additionPrice}>+{formatPrice(addition.price)}</Text>
                <View style={styles.tileControls}>{count>0?<><Pressable onPress={()=>adjust(addition.id,-1)} style={styles.countButton} accessibilityRole="button" accessibilityLabel={`Убрать добавку ${addition.displayName||addition.name}`}><Ionicons name="remove" size={18} color={material.text}/></Pressable><Text style={styles.countValue}>{count}</Text></>:<Text style={styles.small}>Добавить</Text>}<Pressable disabled={atLimit} onPress={()=>adjust(addition.id,1)} style={[styles.countButton,atLimit&&styles.dimmed]} accessibilityRole="button" accessibilityLabel={`Добавить добавку ${addition.displayName||addition.name}`} accessibilityState={{disabled:atLimit}}><Ionicons name="add" size={18} color={material.text}/></Pressable></View>
              </ProductGlass>;})}
            </ScrollView>
            <Text style={styles.additionsSummary} accessibilityLiveRegion="polite">{selectedModifiers.length?`${formatAdditions(selectedModifiers)} · +${formatPrice(extras)} на порцию`:'Без дополнительных добавок'}</Text>
          </View>}
          <View style={styles.comment}><Pressable onPress={()=>setCommentOpen(v=>!v)} accessibilityRole="button" accessibilityLabel="Пожелание бариста" accessibilityState={{expanded:commentOpen}} style={styles.commentToggle}><Text style={styles.lightText}>Пожелание бариста</Text><Ionicons name={commentOpen?'remove':'add'} size={20} color={material.secondary}/></Pressable>{commentOpen&&<><ProductGlass>{keyboardOpen&&<Pressable accessibilityRole="button" accessibilityLabel="Закончить ввод пожелания" onPress={()=>Keyboard.dismiss()} style={styles.noteDone}><Text style={styles.lightText}>Готово</Text></Pressable>}<TextInput onFocus={()=>{noteFocused.current=true;scrollRef.current?.scrollToEnd({animated:true});}} onBlur={()=>{noteFocused.current=false;}} accessibilityLabel="Пожелание к позиции" placeholder="Например, вкус выбранного сиропа" placeholderTextColor={material.faint} value={preparationNote} onChangeText={text=>setPreparationNote(text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g,''))} maxLength={200} multiline style={styles.note}/></ProductGlass><Text style={styles.commentHint}>Пожелание не меняет цену. Платные добавки выбирайте выше.</Text></>}</View>
          {inCart>0&&<Pressable accessibilityRole="button" onPress={()=>{navigation.goBack();navigation.navigate('Tabs',{screen:'CartTab'});}} style={styles.textAction}><Text style={styles.small}>С таким составом в корзине: {inCart} · Открыть корзину</Text></Pressable>}
        </ScrollView>
        {!keyboardOpen&&<ProductGlass style={[styles.footer,{paddingBottom:Math.max(insets.bottom,spacing.md),backgroundColor:visual.footer}]}>
          <View style={styles.actionRow}><ProductGlass style={styles.quantity}>
            <Pressable disabled={quantity<=1||added} onPress={()=>setRequestedQuantity(v=>Math.max(1,v-1))} style={[styles.countButton,quantity<=1&&styles.dimmed]} accessibilityRole="button" accessibilityLabel="Уменьшить количество напитков"><Ionicons name="remove" size={20} color={material.text}/></Pressable><Text style={styles.quantityValue}>{quantity}</Text><Pressable disabled={quantity>=capacity||added} onPress={()=>setRequestedQuantity(v=>Math.min(capacity,v+1))} style={[styles.countButton,quantity>=capacity&&styles.dimmed]} accessibilityRole="button" accessibilityLabel="Увеличить количество напитков"><Ionicons name="add" size={20} color={material.text}/></Pressable>
          </ProductGlass><Pressable onPress={handleAdd} disabled={disabled} accessibilityRole="button" accessibilityLabel={disabled?(added?'Добавлено':capacity===0?'В корзине уже 99':'Позиция недоступна'):`Добавить в корзину ${quantity} шт. за ${formatPrice(total)}`} accessibilityState={{disabled}} style={[styles.addButton,disabled&&!added&&styles.dimmed]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}><HolographicSurface animated variant="line" intensity={1.35} borderRadius={radius.pill} style={StyleSheet.absoluteFill}/></View>
            <Text style={styles.addButtonText} numberOfLines={1}>{added?'Добавлено':!isAvailable||unavailableAdditions.length?'Недоступно':capacity===0?'В корзине 99':`Добавить · ${formatPrice(total)}`}</Text>
          </Pressable></View>
        </ProductGlass>}
      </Animated.View>
    </KeyboardAvoidingView>
  </View>;
}

const styles=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'transparent'},keyboard:{flex:1,justifyContent:'flex-end',alignItems:'center'},
  sheet:{width:'100%',maxWidth:600,maxHeight:'100%',flexShrink:1,borderTopLeftRadius:radius.xlarge,borderTopRightRadius:radius.xlarge,overflow:'hidden',backgroundColor:colors.surface3,borderWidth:1,borderColor:material.border},
  header:{height:48,alignItems:'center',justifyContent:'center'},handle:{width:88,height:44,alignItems:'center',justifyContent:'center'},handleLine:{width:34,height:4,borderRadius:radius.pill,backgroundColor:'rgba(255,255,255,0.3)'},
  headerActions:{position:'absolute',right:spacing.sm,top:2,flexDirection:'row'},iconButton:{width:44,height:44,alignItems:'center',justifyContent:'center'},scroll:{flex:1,minHeight:0},
  hero:{alignItems:'center',paddingBottom:spacing.lg},photo:{alignItems:'center',justifyContent:'center',marginTop:spacing.sm,marginBottom:spacing.md},
  kicker:{alignSelf:'flex-start',fontSize:12,color:material.faint,letterSpacing:1.6,textTransform:'uppercase',paddingRight:44},
  favorite:{position:'absolute',right:0,top:spacing.lg,width:44,height:44,borderRadius:radius.pill,borderWidth:1,borderColor:material.border,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.04)'},
  name:{fontSize:27,fontWeight:'700',letterSpacing:-.7,color:material.text,textAlign:'center'},description:{fontSize:13,lineHeight:20,color:material.secondary,textAlign:'center',marginTop:spacing.sm},
  detailsButton:{minHeight:44,flexDirection:'row',gap:spacing.xs,alignItems:'center'},detailsText:{fontSize:12,color:material.secondary},nutrition:{flexDirection:'row',flexWrap:'wrap',gap:spacing.lg,justifyContent:'center',marginTop:spacing.sm},nutritionValue:{fontSize:14,fontWeight:'600',color:material.text},
  notice:{fontSize:13,lineHeight:20,color:material.text,marginBottom:spacing.md},warning:{padding:spacing.md,marginBottom:spacing.md},lightText:{fontSize:13,lineHeight:20,color:material.text},small:{fontSize:12,lineHeight:18,color:material.faint},
  block:{marginBottom:spacing.md},blockTitle:{fontSize:14,fontWeight:'700',color:material.text},sectionHeading:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:spacing.xs,marginBottom:spacing.sm},
  variants:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginTop:spacing.md},variant:{paddingHorizontal:spacing.lg,paddingVertical:spacing.sm,minHeight:56,gap:spacing.xs},
  groupTabs:{gap:spacing.sm,paddingBottom:spacing.md},groupTab:{minHeight:44,paddingHorizontal:spacing.md,alignItems:'center',justifyContent:'center',borderRadius:radius.pill,borderWidth:1,borderColor:material.border},groupTabActive:{backgroundColor:'rgba(255,255,255,0.14)',borderColor:material.selectedBorder},groupTabText:{fontSize:12,color:material.text},
  tiles:{gap:spacing.md,paddingBottom:spacing.sm},tile:{padding:spacing.md,minHeight:182},ingredient:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',marginBottom:spacing.sm},additionName:{fontSize:14,fontWeight:'600',lineHeight:19,color:material.text,minHeight:38},additionPrice:{fontSize:12,lineHeight:18,color:material.secondary,marginTop:spacing.xs},
  tileControls:{marginTop:spacing.sm,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},countButton:{width:44,height:44,alignItems:'center',justifyContent:'center'},countValue:{fontSize:15,fontWeight:'600',color:material.text},additionsSummary:{fontSize:12,lineHeight:19,color:material.faint,marginTop:spacing.xs},
  noteDone:{minHeight:44,paddingHorizontal:spacing.md,alignItems:'flex-end',justifyContent:'center'},
  comment:{borderTopWidth:1,borderTopColor:material.border},commentToggle:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},note:{minHeight:72,padding:spacing.md,color:material.text,fontSize:14,lineHeight:21,textAlignVertical:'top'},commentHint:{fontSize:12,lineHeight:18,color:material.faint,marginTop:spacing.sm},textAction:{minHeight:44,justifyContent:'center'},
  footer:{borderRadius:0,borderWidth:0,borderTopWidth:1,paddingTop:spacing.md,paddingHorizontal:spacing.lg},actionRow:{flexDirection:'row',gap:spacing.sm,alignItems:'center'},quantity:{flexDirection:'row',alignItems:'center',borderRadius:radius.pill,height:54},quantityValue:{fontSize:15,fontWeight:'600',minWidth:18,textAlign:'center',color:material.text},
  addButton:{height:54,flex:1,minWidth:0,borderRadius:radius.pill,overflow:'hidden',alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.md},addButtonText:{...typography.cardTitle,fontSize:15,fontWeight:'700',color:material.ink,textAlign:'center'},dimmed:{opacity:.4},
});
