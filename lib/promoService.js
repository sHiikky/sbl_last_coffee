// lib/promoService.js
// Активный промо-баннер для мини-баннера на Главной. Таблица
// public.promo_banners управляется вручную через SQL —
// здесь только чтение того, что сейчас попадает в диапазон [starts_at, ends_at].
import { supabase } from './supabaseClient';

export async function getActivePromoBanner() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('promo_banners')
    .select('id, title, subtitle, product_id, starts_at, ends_at')
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[promo] failed to load active banner', error);
    return null;
  }
  return data;
}
