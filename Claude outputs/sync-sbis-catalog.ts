// supabase/functions/sync-sbis-catalog/index.ts
// Supabase Edge Function: синхронизирует таблицу public.products из
// каталога СБИС (priceListId=64, "Осень-Зима 25'26", точка 240).
//
// Версия с защитами:
//   1. "Предохранитель" — если товаров пришло заметно меньше, чем в прошлый
//      успешный запуск, синхронизация НЕ применяется, только логируется.
//   2. Резкий скачок цены (более чем в 3 раза туда/обратно) у уже известного
//      товара не применяется автоматически — старая цена остаётся, скачок
//      просто фиксируется для проверки вручную.
//   3. Каждый запуск логируется в таблицу sync_runs — статус, сколько
//      товаров, что обновилось.
//   4. Уведомление в Telegram после каждого запуска (успех коротким
//      сообщением, ошибка/аномалия — заметным).
//
// Как развернуть (через Supabase Dashboard, без CLI):
// 1. Применить/обновить SQL: SQL Editor -> вставить supabase-products-schema.sql
//    целиком -> Run (там теперь есть и products, и sync_runs — можно
//    перезапускать этот файл сколько угодно раз, он написан безопасно
//    повторно применяться благодаря "if not exists").
// 2. Edge Functions -> Create a new function -> имя: sync-sbis-catalog ->
//    вставить содержимое этого файла -> Deploy.
// 3. Settings -> Edge Functions -> Secrets, добавить:
//      SBIS_APP_CLIENT_ID    = 4402856400799386
//      SBIS_APP_SECRET       = <"Защищённый ключ" из СБИС>
//      SBIS_SECRET_KEY       = <содержимое скачанного файла сервисного ключа>
//      TELEGRAM_BOT_TOKEN    = <токен бота от @BotFather> (необязательно)
//      TELEGRAM_CHAT_ID      = <id чата/канала, куда слать> (необязательно)
//    Если TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы — функция просто не
//    шлёт уведомления, всё остальное работает как обычно.
// 4. Никакого автоматического расписания не настраивайте по умолчанию — цены
//    в кофейне меняются редко, поэтому синхронизация запускается ТОЛЬКО
//    вручную, командой:
//      curl -X POST "https://<project-ref>.supabase.co/functions/v1/sync-sbis-catalog" \
//        -H "Authorization: Bearer <anon-ключ>"
//    Если хочется автоматизации — в Dashboard можно поставить Cron раз в
//    несколько дней (не чаще), но это не обязательно.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const POINT_ID = 240;
const PRICE_LIST_ID = 64; // "Осень-Зима 25'26" — подтверждено как актуальный
const PAGE_SIZE = 25;
const MAX_PAGES = 500;

// Категории, которые уже проверены и являются настоящим меню (см.
// "Claude outputs/sbis-catalog-findings.md") — только их новые товары сразу
// получают is_visible = true при первой синхронизации.
const MENU_CATEGORIES = ['Авторские', 'Напитки Классика', 'Спэшл меню', 'Сытное/Десерты'];

// Если новых "продаваемых" товаров пришло меньше этой доли от прошлого
// успешного запуска — что-то не так с ответом СБИС, синхронизация
// останавливается и НЕ применяет изменения.
const MIN_ITEMS_RATIO = 0.7;

// Если цена уже известного товара отличается от сохранённой более чем во
// столько раз (в любую сторону) — не обновляем эту строку автоматически.
const PRICE_ANOMALY_FACTOR = 3;

const SBIS_IMAGE_HOST = 'https://api.sbis.ru';

async function getToken(): Promise<string> {
  const res = await fetch('https://online.sbis.ru/oauth/service/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_client_id: Deno.env.get('SBIS_APP_CLIENT_ID'),
      app_secret: Deno.env.get('SBIS_APP_SECRET'),
      secret_key: Deno.env.get('SBIS_SECRET_KEY'),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Не удалось получить токен СБИС. HTTP ${res.status}: ${text}`);
  const parsed = JSON.parse(text);
  if (!parsed.token) throw new Error(`В ответе СБИС нет token: ${text}`);
  return parsed.token as string;
}

function extractPage(json: any) {
  const items = json.nomenclatures || json.items || json.result || (Array.isArray(json) ? json : []);
  let hasMore: boolean | undefined;
  if (typeof json.hasMore === 'boolean') hasMore = json.hasMore;
  else if (json.outcome && typeof json.outcome.hasMore === 'boolean') hasMore = json.outcome.hasMore;
  return { items: items || [], hasMore };
}

async function fetchFullCatalog(token: string): Promise<any[]> {
  let all: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      pointId: String(POINT_ID),
      priceListId: String(PRICE_LIST_ID),
      withBalance: 'true',
      withBarcode: 'true',
      pageSize: String(PAGE_SIZE),
      page: String(page),
    });
    const url = `https://api.sbis.ru/retail/v2/nomenclature/list?${params.toString()}`;
    const res = await fetch(url, { headers: { 'X-SBISAccessToken': token } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Каталог СБИС, страница ${page}: HTTP ${res.status}: ${text}`);
    const json = JSON.parse(text);
    const { items, hasMore } = extractPage(json);
    all = all.concat(items);
    if (items.length === 0 || hasMore === false || (hasMore === undefined && items.length < PAGE_SIZE)) break;
  }
  return all;
}

function resolveCategoryName(item: any, folderById: Map<number, any>): string {
  let currentParentId = item.hierarchicalParent;
  let lastName = item.name;
  const seen = new Set<number>();
  while (currentParentId != null && folderById.has(currentParentId) && !seen.has(currentParentId)) {
    seen.add(currentParentId);
    const folder = folderById.get(currentParentId);
    lastName = folder.name;
    if (folder.hierarchicalParent == null) return folder.name;
    currentParentId = folder.hierarchicalParent;
  }
  return lastName;
}

function resolveImageUrl(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null;
  return rawPath.startsWith('http') ? rawPath : `${SBIS_IMAGE_HOST}${rawPath}`;
}

async function sendTelegram(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return; // уведомления не настроены — молча пропускаем, это не ошибка
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (_e) {
    // Не даём сбою Telegram уронить саму синхронизацию — это второстепенный канал.
  }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const startedAt = new Date().toISOString();

  async function logRun(row: Record<string, unknown>) {
    const { error } = await supabase.from('sync_runs').insert({ started_at: startedAt, finished_at: new Date().toISOString(), ...row });
    if (error) console.error('Не удалось записать sync_runs:', error.message);
  }

  try {
    const token = await getToken();
    const catalog = await fetchFullCatalog(token);

    const folderById = new Map<number, any>();
    catalog.forEach(item => {
      if (item.isParent) folderById.set(item.hierarchicalId, item);
    });

    const leafItems = catalog.filter(item => !item.isParent && typeof item.cost === 'number');

    const rows = leafItems.map(item => ({
      sbis_id: item.id,
      name: item.name,
      description: item.description || item.description_simple || null,
      category: resolveCategoryName(item, folderById),
      price: item.cost,
      image_url: resolveImageUrl(Array.isArray(item.images) ? item.images[0] : null),
      raw_payload: item,
    }));

    // Предохранитель №1: сверяем с прошлым УСПЕШНЫМ запуском — если товаров
    // стало заметно меньше, СБИС скорее всего вернул неполный ответ, и
    // применять такие изменения опаснее, чем ничего не делать.
    const { data: lastSuccess } = await supabase
      .from('sync_runs')
      .select('sellable_items')
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSuccess?.sellable_items && rows.length < lastSuccess.sellable_items * MIN_ITEMS_RATIO) {
      const message = `Пришло ${rows.length} товаров, а в прошлый раз было ${lastSuccess.sellable_items} — это подозрительно мало (меньше ${Math.round(MIN_ITEMS_RATIO * 100)}%). Изменения НЕ применены.`;
      await logRun({ status: 'skipped_anomaly', total_fetched: catalog.length, sellable_items: rows.length, error_message: message });
      await sendTelegram(`⚠️ СБИС-синхронизация остановлена: ${message}`);
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = supabase;
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('products')
      .select('sbis_id, price');
    if (existingError) throw existingError;
    const existingBySbisId = new Map((existingRows || []).map(r => [r.sbis_id, r]));

    const toInsert = rows
      .filter(r => !existingBySbisId.has(r.sbis_id))
      .map(r => ({ ...r, is_visible: MENU_CATEGORIES.includes(r.category) }));

    const toUpdate: typeof rows = [];
    const priceAnomalies: Array<{ sbis_id: number; name: string; oldPrice: number; newPrice: number }> = [];

    for (const r of rows) {
      const existing = existingBySbisId.get(r.sbis_id);
      if (!existing) continue; // это toInsert, уже обработан выше

      // Предохранитель №2: цена вдруг стала в 3+ раза больше/меньше —
      // не обновляем автоматически, оставляем прежнюю цену и фиксируем факт.
      const oldPrice = Number(existing.price);
      if (oldPrice > 0 && (r.price > oldPrice * PRICE_ANOMALY_FACTOR || r.price < oldPrice / PRICE_ANOMALY_FACTOR)) {
        priceAnomalies.push({ sbis_id: r.sbis_id, name: r.name, oldPrice, newPrice: r.price });
        toUpdate.push({ ...r, price: oldPrice }); // всё остальное (название, фото) обновляем, цену — нет
      } else {
        toUpdate.push(r);
      }
    }

    let insertedCount = 0;
    const CHUNK = 50;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from('products').insert(chunk);
      if (error) throw error;
      insertedCount += chunk.length;
    }

    let updatedCount = 0;
    for (const r of toUpdate) {
      const { error } = await supabaseAdmin
        .from('products')
        .update({
          name: r.name,
          description: r.description,
          category: r.category,
          price: r.price,
          image_url: r.image_url,
          raw_payload: r.raw_payload,
          updated_at: new Date().toISOString(),
        })
        .eq('sbis_id', r.sbis_id);
      if (error) throw error;
      updatedCount += 1;
    }

    await logRun({
      status: 'success',
      total_fetched: catalog.length,
      sellable_items: rows.length,
      inserted: insertedCount,
      updated: updatedCount,
      price_anomalies: priceAnomalies.length ? priceAnomalies : null,
    });

    const anomalyNote = priceAnomalies.length
      ? `\n⚠️ ${priceAnomalies.length} товар(а) с подозрительным скачком цены не обновлены автоматически — проверьте вручную: ${priceAnomalies.map(a => a.name).join(', ')}`
      : '';
    await sendTelegram(`✅ СБИС-синхронизация: ${rows.length} товаров, добавлено ${insertedCount}, обновлено ${updatedCount}.${anomalyNote}`);

    return new Response(
      JSON.stringify({
        ok: true,
        totalFetched: catalog.length,
        sellableItems: rows.length,
        inserted: insertedCount,
        updated: updatedCount,
        priceAnomalies,
        categories: [...new Set(rows.map(r => r.category))],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = String((error as any)?.message || error);
    await logRun({ status: 'error', error_message: message });
    await sendTelegram(`❌ СБИС-синхронизация упала с ошибкой: ${message}`);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
