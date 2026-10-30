import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from '../AppText';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, typography } from '../../theme/tokens';
import { fetchAppPublications, visiblePublications } from '../../lib/contentService';

function publicationDate(value) {
  return new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Asia/Tomsk', day: 'numeric', month: 'long' });
}

function PublicationImage({ uri, title, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (!uri || failed) return null;
  return <Image source={{ uri }} style={large ? styles.largeImage : styles.image} resizeMode="cover" accessibilityLabel={title} onError={() => setFailed(true)} />;
}

export default function HomePublications({ hPad, products = [], onOpenProduct }) {
  const [publications, setPublications] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [clock, setClock] = useState({ now: Date.now(), offset: 0 });
  useFocusEffect(useCallback(() => {
    let active = true, pending = false;
    async function refresh() {
      if (!active || pending) return;
      pending = true;
      try {
        const received = await fetchAppPublications();
        if (!active) return;
        setPublications(received.items);
        const offset = received.serverNow ? Date.parse(received.serverNow) - Date.now() : 0;
        setClock({ now: Date.now() + offset, offset });
      } catch (_) { /* Keep a previously received publication; expiry still applies. */ }
      finally { pending = false; }
    }
    refresh();
    const interval = setInterval(() => {
      setClock(previous => ({ ...previous, now: Date.now() + previous.offset }));
      refresh();
    }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; clearInterval(interval); subscription.remove(); };
  }, []));

  const items = visiblePublications(publications, clock.now);
  const selected = items.find(item => item.id === selectedId);
  const product = selected?.productId ? products.find(item => item.id === selected.productId) : null;
  if (!items.length) return null;

  return (
    <View style={{ marginHorizontal: hPad, marginTop: spacing.xl }}>
      <Text style={[typography.sectionTitle, styles.heading]}>Жизнь SBL</Text>
      {items.map(item => (
        <Pressable key={item.id} style={({ pressed }) => [styles.card, shadow.card, pressed && styles.pressed]} onPress={() => setSelectedId(item.id)} accessibilityRole="button" accessibilityLabel={`${item.kind === 'promotion' ? 'Акция' : 'Новость'}: ${item.title}. Подробнее`}>
          <PublicationImage uri={item.imageUrl} title={item.title} />
          <View style={styles.body}>
            <View style={styles.meta}>
              <Text style={styles.kind}>{item.kind === 'promotion' ? 'АКЦИЯ' : 'НОВОСТЬ'}</Text>
              <Text style={styles.date}>{item.kind === 'promotion' && item.endsAt ? `До ${publicationDate(item.endsAt)}` : publicationDate(item.startsAt)}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.summary} numberOfLines={3}>{item.body}</Text>
            <View style={styles.readMore}><Text style={styles.link}>Подробнее</Text><Ionicons name="arrow-forward" size={18} color={colors.accent} /></View>
          </View>
        </Pressable>
      ))}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalLabel}>{selected?.kind === 'promotion' ? 'Акция SBL' : 'Новость SBL'}</Text>
            <Pressable style={styles.close} onPress={() => setSelectedId(null)} accessibilityRole="button" accessibilityLabel="Закрыть публикацию"><Ionicons name="close" size={24} color={colors.textPrimary} /></Pressable>
          </View>
          {selected && <ScrollView contentContainerStyle={styles.modalContent}>
            <PublicationImage uri={selected.imageUrl} title={selected.title} large />
            <Text style={styles.title}>{selected.title}</Text>
            <Text style={styles.fullText} selectable>{selected.body}</Text>
            {selected.endsAt && <Text style={styles.date}>До {new Date(selected.endsAt).toLocaleString('ru-RU', { timeZone: 'Asia/Tomsk', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} по Томску</Text>}
            {product && <Pressable style={styles.productButton} onPress={() => { setSelectedId(null); onOpenProduct?.(product); }} accessibilityRole="button"><Text style={styles.productButtonText}>Посмотреть в меню</Text></Pressable>}
          </ScrollView>}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.textPrimary, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceElevated, borderRadius: radius.large, overflow: 'hidden', marginBottom: spacing.md },
  pressed: { opacity: 0.85 },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.skeleton },
  largeImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.large, backgroundColor: colors.skeleton, marginBottom: spacing.xl },
  body: { padding: spacing.lg },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  kind: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  date: { color: colors.textSecondary, fontSize: 12 },
  title: { color: colors.textPrimary, fontSize: 21, fontWeight: '700', marginBottom: spacing.sm },
  summary: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  readMore: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: colors.surface0 },
  modalHeader: { paddingTop: spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  close: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  fullText: { color: colors.textPrimary, fontSize: 16, lineHeight: 25, marginBottom: spacing.xl },
  productButton: { backgroundColor: colors.accent, padding: spacing.lg, borderRadius: radius.pill, alignItems: 'center', marginTop: spacing.xl, minHeight: 48 },
  productButtonText: { color: colors.textOnDark, fontSize: 15, fontWeight: '700' },
});
