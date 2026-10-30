import { supabase } from './supabaseClient';

export function publicationImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s<>"@]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? value : null;
  } catch (_) { return null; }
}

export function normalizePublication(value) {
  if (!value || typeof value.id !== 'string' || !['news', 'promotion'].includes(value.kind)
      || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100
      || typeof value.body !== 'string' || value.body.length > 3000
      || !Number.isFinite(Date.parse(value.starts_at))) return null;
  if (value.ends_at != null && !Number.isFinite(Date.parse(value.ends_at))) return null;
  return {
    id: value.id, kind: value.kind, title: value.title, body: value.body,
    imageUrl: publicationImageUrl(value.image_url),
    productId: typeof value.product_id === 'string' ? value.product_id : null,
    startsAt: value.starts_at, endsAt: value.ends_at || null,
  };
}

export async function fetchAppPublications() {
  const { data, error } = await supabase.rpc('get_app_publications');
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) return { items: [], configured: false, serverNow: null };
    throw error;
  }
  if (!data || !Array.isArray(data.items) || !Number.isFinite(Date.parse(data.server_now))) {
    throw new Error('Invalid publications response');
  }
  return {
    items: data.items.map(normalizePublication).filter(Boolean).slice(0, 20),
    configured: true, serverNow: data.server_now,
  };
}

export function visiblePublications(items, serverNowMs) {
  return items.filter(item => !item.endsAt || Date.parse(item.endsAt) > serverNowMs);
}
