-- 20260911120000_atomic_order_creation.sql
--
-- БЛОК 1 / 1.1 / 1.2 / 1.3 / 1.4 / 1.5 (P0): безопасное и атомарное создание
-- заказа, идемпотентность, recovery, и — в Block 1.5 — приведение ВСЕЙ
-- миграции в соответствие с РЕАЛЬНОЙ схемой production Supabase, полученной
-- через information_schema-интроспекцию (Claude outputs/introspect-orders-schema.sql).
-- До Block 1.5 эта миграция была написана по частично предполагаемым типам
-- (bigint для order_number, text для status, numeric для bonus_redeemed) —
-- НИ ОДИН из них не совпадал с реальной схемой. Ничего из написанного здесь
-- ещё не применялось к production; безопасно запускать (idempotent —
-- `add column if not exists`, `create or replace function`, `create ... if
-- not exists` для индекса).
--
-- ЧТО ИЗМЕНИЛОСЬ В BLOCK 1.5 (по факту интроспекции):
--   1. order_number — integer (не bigint). status — public.order_status enum
--      (не text). bonus_redeemed — integer (не numeric) — это отдельная,
--      целочисленная "валюта" бонусов, а НЕ доля numeric(10,2) денег.
--   2. orders.customer_id nullable (не NOT NULL) — в create_order() это не
--      меняет логику (auth.uid() всё равно обязателен для НАШЕГО RPC), но
--      объясняет, почему обычный NOT NULL constraint не защищает от этого
--      на уровне схемы — защита именно в нашей функции.
--   3. order_items.product_id ДОБАВЛЯЕТСЯ этой миграцией (в проде колонки не
--      было вообще) — nullable, FK на public.products(id) ON DELETE SET
--      NULL (не ON DELETE RESTRICT/CASCADE — архивация/удаление товара не
--      должна ломать исторический заказ). НЕ делаем backfill по
--      product_name для 8 исторических уникальных названий — только одно
--      ("Гранатовый кофе") однозначно матчится с текущим products, для
--      остальных семи угадывать product_id по имени означало бы приписать
--      историческому заказу связь, которую мы не можем подтвердить.
--   4. orders.subtotal/discount_total/promo_code/reward_applied/reward_discount
--      теперь ВСЕ nullable БЕЗ default (в предыдущей версии
--      discount_total/reward_applied/reward_discount имели
--      `not null default 0/false` — это неявно приписывало старым заказам
--      "скидки не было / награда не применялась", хотя на самом деле мы
--      этого просто не знаем). NULL для legacy-заказов — честное "неизвестно".
--      Новые заказы через create_order() всегда заполняют их детерминированно.
--   5. Валидация товара теперь требует `is_modifier = false` в дополнение к
--      `is_visible = true` — модификатор (26 из 142 текущих products) не
--      может быть самостоятельной позицией заказа. Ошибка та же
--      PRODUCT_NOT_AVAILABLE — это концептуально то же "этот id нельзя
--      заказать как есть", отдельный код не вводится.
--   6. product_name в order_items снимок теперь берётся как
--      COALESCE(products.display_name, products.name) — то же кураторское
--      имя, что видит пользователь в большинстве интерфейсов, хотя UI
--      (lib/catalogService.js toAppProduct) дополнительно отрезает
--      объём/размер из названия (splitNameAndSize) — воспроизводить эту
--      строковую эвристику в SQL было бы избыточным расширением scope для
--      simple snapshot-поля; сама позиция всё равно однозначно связана через
--      product_id.
--   7. orders.total ПОДТВЕРЖДЁННО (через реальные bonus-триггеры, см. секцию
--      6 ниже) должен оставаться суммой ПОСЛЕ promo/reward, НО ДО вычитания
--      bonus_redeemed — v_total в create_order() это уже делал верно с
--      Block 1, никакого изменения формулы не потребовалось, только
--      подтверждение и явная документация связи с handle_order_bonus_redeem/
--      handle_order_status_change.
--   8. RLS: удалены две политики, позволявшие обычному клиенту создавать
--      orders/order_items напрямую в обход create_order() — см. секцию 7
--      ниже. staff-политики и SELECT-политики клиентов НЕ тронуты.
--
-- ЧТО ИЗМЕНИЛОСЬ В BLOCK 1.6.1 (static pre-flight, найдено пользователем):
--   9. Добавлен row-level lock (`for share`, `order by p.id`) на все
--      запрошенные products ПЕРЕД validation/price-calculation в
--      create_order() — защита от гонки с sync-sbis-catalog, который может
--      UPDATE products.price/is_visible/is_modifier между несколькими
--      отдельными SELECT'ами внутри одного вызова функции. См. комментарий
--      прямо перед `perform p.id ... for share` в теле create_order().
--  10. Исправлена ссылка в комментарии get_order_by_idempotency_key
--      (устаревший "acceptance test 22" -> актуальный "acceptance test 21").
--  11. Исправлен комментарий "как применить" выше — CLI migration workflow,
--      а не ручной Supabase Dashboard SQL Editor apply (проект теперь
--      использует supabase/migrations).
--
-- Как применить (после ревью пользователем): ЧЕРЕЗ Supabase CLI migration
-- workflow (`supabase db push` после `supabase link` и подтверждённого
-- baseline remote-схемы — см. Block 1.6.1, отдельный proposed workflow в
-- отчёте), а НЕ вручную через Supabase Dashboard SQL Editor. Ручной apply
-- через SQL Editor больше не основной workflow этого проекта: он не
-- фиксируется в migration history и расходится с supabase/migrations. НЕ
-- применялось ни тем, ни другим способом автоматически.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Идемпотентность заказа
-- ─────────────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists idempotency_key uuid;

comment on column public.orders.idempotency_key is
  'Ключ одной попытки оформления заказа с клиента (генерируется один раз на попытку, переиспользуется при retry той же попытки, переживает даже перезапуск приложения — см. lib/orderService.js pending-checkout-attempt). NULL для заказов, созданных до этой миграции, а также для заказов, создаваемых сотрудниками напрямую (staff-flow не проходит через create_order() и не обязан иметь ключ) — НОВЫЕ заказы через create_order() всегда получают ключ, NULL для них невозможен (raise exception, если p_idempotency_key is null).';

-- Партиционный уникальный индекс (а не обычный UNIQUE constraint), чтобы
-- разрешить множество старых/будущих строк с idempotency_key IS NULL —
-- уникальность нужна только среди реальных ключей одного покупателя.
-- ВАЖНО: ON CONFLICT ниже в create_order() обязан указывать ТОТ ЖЕ
-- предикат WHERE idempotency_key IS NOT NULL, иначе Postgres не сможет
-- вывести этот индекс как arbiter для частичного unique-индекса.
create unique index if not exists orders_customer_idempotency_key_uniq
  on public.orders (customer_id, idempotency_key)
  where idempotency_key is not null;

-- Канонический fingerprint содержимого попытки (товары+количества+промокод+
-- reward+сумма списания бонусов) — нужен, чтобы отличить "тот же запрос
-- пришёл повторно" (retry) от "тот же ключ ошибочно/злонамеренно
-- переиспользован для ДРУГОГО заказа" (см. секцию 4 ниже, IDEMPOTENCY_CONFLICT).
-- Хранится как jsonb (канонический объект), сравнивается через
-- IS DISTINCT FROM — без md5/криптографии, без лишней инфраструктуры.
alter table public.orders
  add column if not exists request_fingerprint jsonb;

comment on column public.orders.request_fingerprint is
  'Канонический jsonb-снимок присланных товаров (отсортированных по product_id, после агрегации дублей) + промокода + reward-флага + суммы списания бонусов на момент создания заказа. Используется ТОЛЬКО для проверки повторного использования idempotency_key (сравнение через IS DISTINCT FROM) — НЕ участвует в расчёте цены. Источник истины — этот серверный расчёт; клиент присылает свой fingerprint (см. lib/orderService.js buildRequestFingerprint) только для локального "корзина не изменилась?", сервер ему не доверяет и никогда не принимает как параметр.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. order_items.product_id — колонки в production НЕ БЫЛО ВООБЩЕ (см.
-- Block 1.5, секция C интроспекции). Добавляем nullable + FK ON DELETE SET
-- NULL — архивация/удаление товара из products не должна разрушать
-- исторический order_item (ON DELETE CASCADE удалило бы саму строку заказа,
-- ON DELETE RESTRICT заблокировало бы удаление товара навсегда, пока жива
-- хоть одна ссылка — оба хуже, чем просто обнулить ссылку и оставить
-- product_name/price как есть).
--
-- НЕ делаем backfill по существующим 14 order_items: из 8 уникальных
-- исторических product_name только "Гранатовый кофе" однозначно совпадает
-- с текущим products.name/display_name; остальные семь ("Айс латте",
-- "Бамбл на грейпфруте", "Лимонад-расцветай", "Мороженое гранат-орех",
-- "Пинк-дринк матча", "Тестовый капучино (grillme e2e test)",
-- "Эспрессо-тоник на игристом") не имеют точного соответствия — вероятно,
-- эти товары были переименованы/удалены из каталога с тех пор. Угадывать
-- product_id по неточному совпадению строки означало бы приписать
-- историческому заказу связь, которую нельзя подтвердить, поэтому все 14
-- существующих order_items остаются с product_id = NULL. Это сознательное
-- решение, а не недосмотр.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.order_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

comment on column public.order_items.product_id is
  'Ссылка на public.products на момент заказа. NULL для всех 14 строк, существовавших до этой миграции (сознательно не бэкфилленных — см. комментарий выше), и снова NULL, если товар впоследствии был удалён из products (ON DELETE SET NULL) — product_name/price при этом остаются нетронутым историческим снимком. Каждая НОВАЯ строка, созданная через create_order(), всегда имеет product_id.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. orders: серверный разбор суммы (subtotal/discount/promo/reward).
--
-- Все пять колонок ниже — NULLABLE БЕЗ default. Раньше (до Block 1.5)
-- discount_total/reward_applied/reward_discount имели `not null default
-- 0/false`, что неявно приписывало 16 существующим заказам "скидки не
-- было, награда не применялась" — фактически мы этого не знаем (заказы
-- создавались другим путём, до появления этих колонок). NULL здесь — это
-- честное "неизвестно", а не выдуманное бизнес-значение. Каждая НОВАЯ
-- строка от create_order() заполняет все пять полей детерминированно (0
-- вместо NULL для отсутствующей скидки — это уже РЕАЛЬНОЕ значение,
-- посчитанное на этом конкретном заказе, а не default "на всякий случай").
-- ─────────────────────────────────────────────────────────────────────────

alter table public.orders add column if not exists subtotal numeric(10, 2);
alter table public.orders add column if not exists discount_total numeric(10, 2);
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists reward_applied boolean;
alter table public.orders add column if not exists reward_discount numeric(10, 2);

comment on column public.orders.subtotal is
  'Сумма quantity*price по актуальным ценам products на момент заказа, ДО промокода и ДО награды лояльности. Считается только на сервере, в create_order(). NULL для заказов, созданных до Block 1 (breakdown не существовал).';
comment on column public.orders.discount_total is
  'Скидка по промокоду (сейчас — фиксированные 10% по коду SBL10, как и раньше на клиенте). НЕ включает bonus_redeemed. NULL — заказ создан до Block 1, разбивка неизвестна (НЕ означает "скидки не было").';
comment on column public.orders.promo_code is
  'Промокод, который клиент указал при оформлении (после normalize: trim+upper). NULL, если не применялся, был неверным, либо заказ создан до Block 1.';
comment on column public.orders.reward_applied is
  'true/false, если create_order() определённо применил/не применил награду "бесплатный десерт" — сервер проверяет только формальную применимость (есть ли в корзине десерт), НЕ факт того, что награда реально заработана (см. секцию 6 в теле функции). NULL — заказ создан до Block 1, неизвестно.';
comment on column public.orders.reward_discount is
  'Сумма, на которую уменьшен total из-за reward_applied = true. 0 (не NULL), если новый заказ создан БЕЗ награды — это точно известное значение. NULL — заказ создан до Block 1.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. create_order(): единственная точка входа для оформления заказа.
-- ─────────────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER + SET search_path = '' — внутри функции ДОЛЖНЫ быть
-- полностью квалифицированы все объекты (public.orders, public.products,
-- auth.uid()); неквалифицированное имя таблицы с пустым search_path просто
-- не найдётся (кроме встроенных функций/типов — они всегда резолвятся через
-- pg_catalog независимо от search_path). Это строже, чем существующие
-- бонусные триггер-функции в проекте (handle_order_bonus_redeem/
-- handle_order_status_change сейчас используют `search_path=public`,
-- owner=postgres, EXECUTE выдан PUBLIC/anon/authenticated/service_role) —
-- это отдельный, уже существующий legacy hardening issue, который НЕ
-- переписывается в этой миграции (см. итоговый отчёт, "что остаётся
-- unresolved").
--
-- customer_id НИКОГДА не принимается параметром — источник только auth.uid().
-- Анонимные Supabase-пользователи (signInAnonymously) имеют роль
-- authenticated и валидный auth.uid(), это ожидаемо и достаточно. То, что
-- orders.customer_id в реальной схеме nullable, не ослабляет эту защиту —
-- наша функция сама требует auth.uid() независимо от того, что допускает
-- сама колонка.
--
create or replace function public.create_order(
  p_idempotency_key uuid,
  p_items jsonb,
  p_promo_code text default null,
  p_reward_requested boolean default false,
  p_bonus_redeem numeric default 0
)
returns table (
  id uuid,
  order_number integer,
  status public.order_status,
  total numeric(10, 2),
  subtotal numeric(10, 2),
  discount_total numeric(10, 2),
  bonus_redeemed integer,
  reward_applied boolean,
  reward_discount numeric(10, 2),
  created_at timestamptz,
  idempotency_key uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ── Лимиты на злоупотребление payload'ом ────────────────────────────────
  c_max_qty_per_line constant int := 50;   -- максимум quantity на один product_id ПОСЛЕ агрегации дублей
  c_max_raw_lines constant int := 100;     -- максимум элементов в самом p_items ДО агрегации (защита от гигантского payload)
  c_max_lines constant int := 50;          -- максимум РАЗНЫХ product_id в одном заказе
  c_max_total_qty constant int := 300;     -- максимум суммарного количества товаров в одном заказе
  c_dessert_category constant text := 'Десерты'; -- см. data/products.js DESSERT_CATEGORY — единственное другое место с этим значением

  v_customer_id uuid := auth.uid();
  v_order_id uuid;
  v_raw_count int;
  v_matched_count int;
  v_line_count int;
  v_total_qty int;
  v_items_canonical jsonb;
  v_fingerprint jsonb;
  v_subtotal numeric(10, 2);
  v_discount_total numeric(10, 2) := 0;
  v_promo_code text;
  v_reward_requested boolean := coalesce(p_reward_requested, false);
  v_reward_product_id uuid;
  v_reward_unit_price numeric(10, 2);
  v_reward_discount numeric(10, 2) := 0;
  v_reward_applied boolean := false;
  -- bonus_redeemed в реальной схеме — integer (не numeric(10,2)): это
  -- отдельная "валюта" бонусных баллов, а не денежная сумма с копейками.
  -- floor(...) детерминированно приводит клиентское предпочтение к целому.
  v_bonus_redeem integer := floor(greatest(coalesce(p_bonus_redeem, 0), 0))::integer;
  v_total numeric(10, 2);
  v_existing_fingerprint jsonb;
  rec record;
  v_remaining_qty int;
begin
  if v_customer_id is null then
    raise exception 'NOT_AUTHENTICATED: не удалось определить пользователя — нет активной сессии.' using errcode = '28000';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_PAYLOAD: idempotency_key обязателен.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_PAYLOAD: корзина пуста.' using errcode = '22023';
  end if;

  -- ── Защита от гигантского payload ДО какой-либо агрегации/обработки ─────
  v_raw_count := jsonb_array_length(p_items);
  if v_raw_count > c_max_raw_lines then
    raise exception 'INVALID_PAYLOAD: слишком много позиций в запросе (%).', v_raw_count using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    where x.product_id is null or x.quantity is null or x.quantity <= 0
  ) then
    raise exception 'INVALID_PAYLOAD: некорректная позиция в заказе (нет product_id или quantity <= 0).' using errcode = '22023';
  end if;

  -- ── Детерминированная агрегация дублирующихся product_id: одинаковый
  -- товар в двух строках payload суммируется, а не отклоняется — это
  -- безопаснее (легитимный повторный сабмит того же товара не ломает
  -- заказ), но полностью снимает риск "обойти лимит quantity на строку,
  -- продублировав строки". ──────────────────────────────────────────────
  select count(*), coalesce(sum(x.quantity), 0)
    into v_line_count, v_total_qty
  from (
    select x.product_id, sum(x.quantity)::int as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by x.product_id
  ) x;

  if v_line_count > c_max_lines then
    raise exception 'INVALID_PAYLOAD: слишком много разных товаров в заказе (%).', v_line_count using errcode = '22023';
  end if;
  if v_total_qty > c_max_total_qty then
    raise exception 'INVALID_QUANTITY: слишком большое суммарное количество товаров в заказе (%).', v_total_qty using errcode = '22023';
  end if;
  if exists (
    select 1
    from (
      select x.product_id, sum(x.quantity)::int as quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
      group by x.product_id
    ) x
    where x.quantity > c_max_qty_per_line
  ) then
    raise exception 'INVALID_QUANTITY: слишком большое количество одного товара в заказе (максимум % шт.).', c_max_qty_per_line using errcode = '22023';
  end if;

  -- ── Канонический fingerprint попытки (после агрегации дублей, до
  -- проверки доступности товаров — так retry с уже недоступным товаром
  -- всё равно корректно матчится с уже существующим заказом). ─────────────
  select jsonb_agg(jsonb_build_object('product_id', x.product_id, 'quantity', x.quantity) order by x.product_id)
    into v_items_canonical
  from (
    select x.product_id, sum(x.quantity)::int as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by x.product_id
  ) x;

  v_promo_code := nullif(upper(trim(coalesce(p_promo_code, ''))), '');

  v_fingerprint := jsonb_build_object(
    'items', coalesce(v_items_canonical, '[]'::jsonb),
    'promo_code', v_promo_code,
    'reward_requested', v_reward_requested,
    'bonus_redeem', v_bonus_redeem
  );

  -- ── Идемпотентность: если для (customer_id, idempotency_key) заказ уже
  -- существует — сверяем fingerprint. Совпал -> это retry, отдаём тот же
  -- заказ. Не совпал -> тот же ключ используется для ДРУГОЙ попытки, это
  -- ошибка вызывающего кода (или попытка злоупотребления), а не "заново
  -- посчитать и молча всё равно выдать старый заказ". ─────────────────────
  select o.id, o.request_fingerprint into v_order_id, v_existing_fingerprint
  from public.orders o
  where o.customer_id = v_customer_id and o.idempotency_key = p_idempotency_key;

  if v_order_id is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT: idempotency_key уже использован для другой попытки оформления заказа.' using errcode = '23505';
    end if;

    return query
      select o.id, o.order_number, o.status, o.total, o.subtotal, o.discount_total,
             o.bonus_redeemed, o.reward_applied, o.reward_discount, o.created_at, o.idempotency_key
      from public.orders o
      where o.id = v_order_id;
    return;
  end if;

  -- ── Block 1.6.1: row-level lock на все реально существующие запрошенные
  -- товары, взятый ДО validation/price-calculation и держащийся до конца
  -- транзакции этого вызова create_order(). Причина: ниже мы читаем
  -- public.products НЕСКОЛЬКО РАЗ отдельными запросами (validation, subtotal,
  -- reward-подбор десерта, order_items snapshot) — если между ними
  -- параллельно выполнится sync-sbis-catalog (UPDATE products.price /
  -- is_visible / is_modifier), эти чтения могут увидеть РАЗНЫЕ версии одного
  -- и того же товара внутри одного заказа (например, validation увидит
  -- старую цену, а order_items snapshot — уже новую).
  --
  -- `for share` (не `for update`) — мы здесь НЕ собираемся менять products,
  -- нам нужно только не дать никому ДРУГОМУ их поменять, пока наш вызов не
  -- закончится; несколько одновременных create_order(), НЕ пересекающихся по
  -- товарам, продолжают работать полностью параллельно. `order by p.id` —
  -- детерминированный порядок взятия блокировок: он устраняет lock-order
  -- race именно МЕЖДУ вызовами create_order() (все они берут локи в одной и
  -- той же последовательности p.id, поэтому два create_order() с
  -- пересекающимся набором товаров не могут заблокировать друг друга
  -- "навстречу"). Это НЕ гарантия отсутствия deadlock вообще: другой writer
  -- — например, sync-sbis-catalog — может обновлять те же строки products в
  -- произвольном порядке, никак не согласованном с ORDER BY здесь, и создать
  -- deadlock с create_order(). Postgres в любом случае обнаружит такой
  -- deadlock (deadlock_timeout) и откатит одну из транзакций с ошибкой
  -- `deadlock detected` — это последняя линия защиты, на которую мы и так
  -- полагаемся, ORDER BY лишь снижает вероятность конкретно
  -- create_order()-на-create_order() конфликтов, а не отменяет её. Клиент
  -- (см. lib/orderService.js) уже штатно обрабатывает произвольные ошибки
  -- create_order() как non-deterministic и уходит в recovery-flow, поэтому
  -- отдельная retry-логика именно для deadlock здесь не вводится. Несуществующие
  -- product_id просто не попадут в выборку — их отсутствие всё равно поймает
  -- проверка v_matched_count <> v_line_count чуть ниже, как и раньше.
  --
  -- Это МИНИМАЛЬНОЕ решение (row-level lock), а не единый snapshot одним
  -- запросом в temp-структуру — для текущего масштаба (десятки строк на
  -- заказ, максимум c_max_lines=50 разных товаров) разница в накладных
  -- расходах пренебрежимо мала, а лок проще для чтения/ревью, чем
  -- материализация snapshot в CTE и переписывание всех четырёх последующих
  -- запросов на чтение из него. Если объём вырастет на порядки — стоит
  -- пересмотреть в пользу единого snapshot.
  perform p.id
  from public.products p
  where p.id in (
    select x.product_id
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by x.product_id
  )
  order by p.id
  for share;

  -- ── Валидация товаров: каждый product_id должен существовать, быть
  -- видимым в меню (is_visible = true) — то же условие, что и в
  -- lib/catalogService.js fetchVisibleProducts() — и НЕ быть модификатором
  -- (is_modifier = false, Block 1.5, секция F: 26 из 142 текущих products —
  -- модификаторы, которые не могут быть самостоятельной позицией заказа;
  -- отдельная архитектура модификаторов внутри заказа в этом блоке не
  -- вводится — если товар is_modifier=true, вся строка отклоняется тем же
  -- кодом PRODUCT_NOT_AVAILABLE, что и невидимый/несуществующий товар).
  --
  -- is_visible — это UI-видимость в меню, а не "можно ли реально
  -- приготовить прямо сейчас" (стоп-лист/остатки). В public.products НЕТ
  -- отдельного поля is_available/stock/balance (подтверждено интроспекцией)
  -- — фиксируем это как БУДУЩУЮ проблему, новое поведение здесь не
  -- изобретаем.
  select count(*) into v_matched_count
  from (
    select x.product_id
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by x.product_id
  ) x
  join public.products p on p.id = x.product_id and p.is_visible = true and p.is_modifier = false;

  if v_matched_count <> v_line_count then
    raise exception 'PRODUCT_NOT_AVAILABLE: один или несколько товаров недоступны для заказа.' using errcode = '22023';
  end if;

  -- ── Server-side pricing: subtotal только по ценам из products. ──────────
  select sum(p.price * x.quantity) into v_subtotal
  from (
    select x.product_id, sum(x.quantity)::int as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by x.product_id
  ) x
  join public.products p on p.id = x.product_id;

  -- ── Промокод — тот же единственный код, что был захардкожен в
  -- CartScreen.applyPromo(), перенесён без изменения результата.
  -- v_subtotal — numeric(10,2) (тот же тип, что products.price),
  -- round(numeric, 2) — детерминированное округление до 2 знаков без
  -- float/double на всём пути; денежная модель проекта здесь не меняется. ──
  if v_promo_code = 'SBL10' then
    v_discount_total := round(v_subtotal * 0.1, 2);
  else
    v_discount_total := 0;
    v_promo_code := null;
  end if;

  -- ── Награда "бесплатный десерт" — ЧТО СЕРВЕР МОЖЕТ И НЕ МОЖЕТ ПРОВЕРИТЬ
  -- (это НЕ закрытый вопрос, см. итоговый отчёт после этого блока):
  --   Клиент присылает: p_reward_requested (boolean) — "я считаю, что у
  --     меня есть неиспользованная награда 'бесплатный десерт'".
  --   Сервер РЕАЛЬНО проверяет: есть ли среди присланных товаров десерт
  --     (menu_category = 'Десерты', точное совпадение регистра/кириллицы —
  --     подтверждено интроспекцией: 30 видимых товаров в этой категории) —
  --     та же проверка и та же стратегия выбора (cheapest_dessert), что
  --     раньше делал loyalty/loyaltyService.js на клиенте. Если десерта нет
  --     — сервер просто не применяет скидку, независимо от p_reward_requested.
  --   Сервер НЕ МОЖЕТ проверить: действительно ли эта конкретная награда
  --     была заработана (10-дневная серия, milestone) — потому что вся
  --     программа лояльности хранит state ТОЛЬКО в AsyncStorage на телефоне,
  --     в Supabase для неё нет ни одной таблицы (задокументированное
  --     ограничение самого loyaltyService.js). Любой клиент, отправивший
  --     p_reward_requested = true с десертом в корзине, ПОЛУЧИТ скидку —
  --     это не хуже, чем было (раньше клиент мог обнулить цену вообще любой
  --     позиции без проверки категории), но и не лучше в главном: сервер не
  --     знает, "заслужена" ли награда. Остаётся открытым P0/P1 business-
  --     integrity риском, не закрывается в этой миграции. ──────────────────
  if v_reward_requested then
    select p.id, p.price
      into v_reward_product_id, v_reward_unit_price
    from (
      select x.product_id, sum(x.quantity)::int as quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
      group by x.product_id
    ) x
    join public.products p on p.id = x.product_id and p.is_visible = true and p.is_modifier = false
    where p.menu_category = c_dessert_category
    order by p.price asc
    limit 1;

    if v_reward_product_id is not null then
      v_reward_discount := v_reward_unit_price;
      v_reward_applied := true;
    end if;
  end if;

  -- ── ДЕНЕЖНАЯ СЕМАНТИКА (подтверждена реальными bonus-триггерами, Block
  -- 1.5, секции I/J): orders.total — это стоимость ПОСЛЕ promo/reward
  -- скидок, но ДО вычитания bonus_redeemed. Именно orders.total (полный, не
  -- уменьшенный на бонусы) использует handle_order_bonus_redeem() как базу
  -- для лимита `max_redeemable = floor(total * 0.5)`, и именно из НЕГО
  -- handle_order_status_change() при переходе в completed вычитает
  -- bonus_redeemed для получения cash_paid = greatest(total - bonus_redeemed, 0).
  -- Если бы total здесь уже учитывал вычет бонусов, бонус был бы вычтен из
  -- суммы дважды (один раз здесь, второй раз логически в триггерах) — это
  -- была бы денежная ошибка, а не просто расхождение отображения. Сервисный
  -- сбор (service fee) в текущей клиентской логике (CartScreen.js) всегда
  -- равен 0 (`subtotal > 0 ? 0 : 0`) — поэтому в формулу ниже не добавляется
  -- отдельным слагаемым; если это когда-либо изменится на клиенте, эту
  -- формулу нужно будет обновить синхронно. ──────────────────────────────
  v_total := greatest(0, v_subtotal - v_discount_total - v_reward_discount);

  -- ── Атомарное создание заказа с защитой от гонки на том же
  -- idempotency_key. WHERE-предикат здесь ОБЯЗАН совпадать с предикатом
  -- частичного уникального индекса orders_customer_idempotency_key_uniq —
  -- иначе Postgres не сможет использовать его как arbiter и упадёт с
  -- ошибкой "no unique or exclusion constraint matching ON CONFLICT".
  --
  -- bonus_redeemed передаётся как v_bonus_redeem (integer) — если он
  -- нарушает существующие бизнес-правила (превышает 50% от total, либо
  -- превышает реальный balance покупателя), это обнаружит и остановит
  -- (raise exception) СУЩЕСТВУЮЩИЙ AFTER INSERT-триггер
  -- orders_bonus_redeem_trigger -> handle_order_bonus_redeem() — эта
  -- миграция сознательно НЕ дублирует его проверки здесь: они уже
  -- concurrency-safe (SELECT ... FOR UPDATE на bonus_accounts.balance) и
  -- являются единственным источником истины для лимитов бонусов. Поскольку
  -- триггер выполняется в рамках той же самой транзакции/вызова функции,
  -- его exception откатывает ВЕСЬ create_order() целиком, включая уже
  -- вставленную строку orders — до order_items дело не доходит (acceptance
  -- test 14). ──────────────────────────────────────────────────────────
  insert into public.orders (
    customer_id, status, total, subtotal, discount_total, promo_code,
    reward_applied, reward_discount, bonus_redeemed, idempotency_key, request_fingerprint
  )
  values (
    v_customer_id, 'new'::public.order_status, v_total, v_subtotal, v_discount_total, v_promo_code,
    v_reward_applied, v_reward_discount, v_bonus_redeem, p_idempotency_key, v_fingerprint
  )
  on conflict (customer_id, idempotency_key) where idempotency_key is not null do nothing
  returning orders.id into v_order_id;

  if v_order_id is null then
    -- Проиграли гонку: параллельный вызов с тем же ключом успел
    -- закоммититься первым. Возвращаем ЕГО заказ (со сверкой fingerprint —
    -- та же логика конфликта, что и в быстром пути выше), свои order_items
    -- не создаём — иначе получили бы дубль позиций.
    select o.id, o.request_fingerprint into v_order_id, v_existing_fingerprint
    from public.orders o
    where o.customer_id = v_customer_id and o.idempotency_key = p_idempotency_key;

    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT: idempotency_key уже использован для другой попытки оформления заказа.' using errcode = '23505';
    end if;

    return query
      select o.id, o.order_number, o.status, o.total, o.subtotal, o.discount_total,
             o.bonus_redeemed, o.reward_applied, o.reward_discount, o.created_at, o.idempotency_key
      from public.orders o
      where o.id = v_order_id;
    return;
  end if;

  -- ── order_items: одна строка на товар (после агрегации дублей), кроме
  -- награждённой позиции — её разбиваем на "бесплатную единицу" + "остаток
  -- по полной цене", как и раньше делал CartScreen.handleOrder.
  -- product_name — снимок COALESCE(display_name, name): то же кураторское
  -- имя, что предпочитает показывать UI (см. lib/catalogService.js
  -- toAppProduct), хотя финальная UI-строка на клиенте дополнительно режет
  -- объём/размер (splitNameAndSize) — воспроизводить эту чисто визуальную
  -- эвристику в SQL для snapshot-поля избыточно; связь с реальным товаром
  -- всегда есть через product_id. ─────────────────────────────────────────
  for rec in
    select p.id as product_id, coalesce(p.display_name, p.name) as product_name, p.price as unit_price, x.quantity
    from (
      select x.product_id, sum(x.quantity)::int as quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
      group by x.product_id
    ) x
    join public.products p on p.id = x.product_id
  loop
    if v_reward_applied and rec.product_id = v_reward_product_id then
      insert into public.order_items (order_id, product_id, product_name, quantity, price)
      values (v_order_id, rec.product_id, rec.product_name, 1, 0);

      v_remaining_qty := rec.quantity - 1;
      if v_remaining_qty > 0 then
        insert into public.order_items (order_id, product_id, product_name, quantity, price)
        values (v_order_id, rec.product_id, rec.product_name, v_remaining_qty, rec.unit_price);
      end if;
    else
      insert into public.order_items (order_id, product_id, product_name, quantity, price)
      values (v_order_id, rec.product_id, rec.product_name, rec.quantity, rec.unit_price);
    end if;
  end loop;

  return query
    select o.id, o.order_number, o.status, o.total, o.subtotal, o.discount_total,
           o.bonus_redeemed, o.reward_applied, o.reward_discount, o.created_at, o.idempotency_key
    from public.orders o
    where o.id = v_order_id;
end;
$$;

-- ── Права: явный, узкий allowlist ────────────────────────────────────────
revoke all on function public.create_order(uuid, jsonb, text, boolean, numeric) from public;
revoke all on function public.create_order(uuid, jsonb, text, boolean, numeric) from anon;
grant execute on function public.create_order(uuid, jsonb, text, boolean, numeric) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. get_order_by_idempotency_key(): ЧИСТО read-only lookup.
--
-- Причина существования отдельной функции, а не переиспользования
-- create_order(): create_order() при отсутствии заказа СОЗДАЁТ его — это
-- ровно то поведение, которое recovery-механизм (App.js, Block 1.2-1.4)
-- запрещает вызывать автоматически при старте/foreground/фокусе экрана.
-- "Есть незавершённая попытка" означает только "клиент не знает исход
-- предыдущего запроса", а НЕ "пользователь сейчас заново подтвердил
-- оформление".
--
-- Эта функция: только select, без единого insert/update/delete; не
-- принимает ничего, кроме ключа; auth.uid() — как и в create_order(),
-- customer_id никогда не берётся параметром, поэтому lookup чужого ключа
-- всегда возвращает пустой результат, а не чужие данные (acceptance test
-- 21 — Block 1.6.1: переделан на реальную смену auth.uid() между двумя
-- пользователями внутри одной транзакции, а не просто SKIPPED-заглушку).
-- ────────────────────────────────────────────────────────────────────

create or replace function public.get_order_by_idempotency_key(p_idempotency_key uuid)
returns table (
  id uuid,
  order_number integer,
  status public.order_status,
  total numeric(10, 2),
  bonus_redeemed integer,
  reward_applied boolean,
  created_at timestamptz,
  idempotency_key uuid,
  request_fingerprint jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select o.id, o.order_number, o.status, o.total, o.bonus_redeemed,
         o.reward_applied, o.created_at, o.idempotency_key, o.request_fingerprint
  from public.orders o
  where o.customer_id = auth.uid()
    and o.idempotency_key = p_idempotency_key;
$$;

comment on function public.get_order_by_idempotency_key(uuid) is
  'Только чтение: находит заказ текущего пользователя (auth.uid()) по idempotency_key. Никогда не создаёт заказ. Возвращает request_fingerprint, чтобы вызывающий клиент мог локально сверить, совпадает ли найденный заказ с текущим содержимым корзины (см. lib/orderService.js recoverPendingCheckoutOnce), не доверяя собственному клиентскому fingerprint как источнику истины.';

revoke all on function public.get_order_by_idempotency_key(uuid) from public;
revoke all on function public.get_order_by_idempotency_key(uuid) from anon;
grant execute on function public.get_order_by_idempotency_key(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS — закрыть прямой INSERT обычного клиента в обход create_order().
--
-- ПОДТВЕРЖДЁННАЯ проблема (Block 1.5, секция N): сейчас обычный клиент
-- может напрямую INSERT в orders (если customer_id = auth.uid()) и в
-- order_items (для своего заказа), самостоятельно указывая status/total/
-- bonus_redeemed/price/quantity — то есть безопасный create_order() можно
-- полностью обойти прямым запросом к таблице.
--
-- Удаляются ТОЛЬКО две политики ниже — они разрешали обычному
-- аутентифицированному клиенту (не staff) создавать строки напрямую.
-- НЕ трогаются:
--   - "clients see own orders" / "clients see own order items" (SELECT) —
--     чтение своих заказов остаётся как было;
--   - "staff full access orders" / "staff full access order items" (ALL) —
--     это ОТДЕЛЬНЫЕ политики, определяющие сотрудника через
--     `exists (select 1 from public.staff where staff.user_id = auth.uid())`,
--     они никак не пересекаются с удаляемыми client-политиками и продолжают
--     разрешать сотрудникам создавать/менять заказы напрямую (касса/бариста
--     workflow не ломается);
--   - политика products (SELECT true) — публичное чтение каталога не меняется.
--
-- После удаления этих двух политик у обычного (не staff) клиента не
-- остаётся ни одной INSERT-политики на orders/order_items — RLS по
-- умолчанию запрещает операцию, для которой нет разрешающей политики, так
-- что явно новую "deny"-политику создавать не нужно. create_order() при
-- этом продолжает работать: это SECURITY DEFINER функция, выполняющаяся от
-- имени её владельца (а не вызывающей роли), поэтому RLS обычного клиента
-- на неё не распространяется — ровно так же, как уже работают существующие
-- бонусные SECURITY DEFINER функции.
--
-- Отдельный, более широкий RLS/grants hardening (в частности, избыточные
-- TRUNCATE/TRIGGER/REFERENCES-права anon/authenticated на многих таблицах,
-- см. секцию O итогового отчёта) — предмет следующего блока, не делается
-- здесь вслепую.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "clients create own orders" on public.orders;
drop policy if exists "clients create own order items" on public.order_items;
