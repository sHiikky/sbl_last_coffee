-- supabase-products-schema.sql
-- Таблица меню (товары + цены), которую синхронизирует Edge Function
-- sync-sbis-catalog.ts из СБИС. Приложение читает только эту таблицу и
-- никогда не обращается к СБИС напрямую.
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  -- Числовой id товара в СБИС (поле "id" в ответе nomenclature/list) —
  -- уникальный ключ для синхронизации (upsert по нему).
  sbis_id integer not null unique,

  name text not null,
  description text,
  category text not null,       -- верхнеуровневая категория из СБИС (Авторские, Напитки Классика, Спэшл меню, Сытное/Десерты и т.д.)
  price numeric(10, 2) not null,
  image_url text,                -- относительный /img?params=... или полный URL

  -- Защита от "синхронизация тихо показала клиентам что-то новое и
  -- непроверенное": по умолчанию false для товаров из категорий, которые
  -- ещё не входят в список меню; сама Edge Function включает true только
  -- при первой синхронизации для уже известных категорий меню, дальше это
  -- поле трогаете только вы вручную в Table Editor.
  is_visible boolean not null default false,

  -- Ручная курация для главного экрана — синхронизация из СБИС этого не
  -- знает и не трогает, включайте вручную у нескольких напитков.
  is_quick_pick boolean not null default false,
  badge text,                    -- 'hit' | 'new' | null — тоже ручная курация

  sort_order integer not null default 0,

  raw_payload jsonb,             -- сырой ответ СБИС по этой позиции — для отладки
  updated_at timestamptz not null default now()
);

create index if not exists products_visible_category_idx
  on public.products (is_visible, category, sort_order);

alter table public.products enable row level security;

-- Читать могут все (в т.ч. анонимные клиенты приложения) — как и остальной
-- публичный каталог. Изменять таблицу может только сервисный ключ
-- (используется внутри Edge Function), обычным ключам приложения это
-- не разрешено — insert/update/delete policy сознательно не создаются.
drop policy if exists "Products are readable by everyone" on public.products;
create policy "Products are readable by everyone"
  on public.products for select
  using (true);

-- Журнал каждого запуска синхронизации с СБИС — чтобы видеть здоровье
-- интеграции, не копаясь в логах Edge Function. Пишет только сама функция
-- (сервисным ключом), читать может кто угодно, кому вы откроете доступ в
-- Table Editor.
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,                 -- 'success' | 'error' | 'skipped_anomaly'
  total_fetched integer,
  sellable_items integer,
  inserted integer,
  updated integer,
  price_anomalies jsonb,                -- список товаров, у которых новая цена отличалась от старой более чем в 3 раза — они не обновились автоматически
  error_message text
);

create index if not exists sync_runs_started_at_idx on public.sync_runs (started_at desc);

alter table public.sync_runs enable row level security;

drop policy if exists "Sync runs are readable by everyone" on public.sync_runs;
create policy "Sync runs are readable by everyone"
  on public.sync_runs for select
  using (true);
