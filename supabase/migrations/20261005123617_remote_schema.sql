SET local check_function_bodies = off;

CREATE SEQUENCE "public"."orders_order_number_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."bonus_accounts" (
  "customer_id"   uuid                     NOT NULL,
  "balance"       integer                  NOT NULL DEFAULT 0,
  "lifetime_paid" numeric                  NOT NULL DEFAULT 0,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bonus_accounts_balance_nonneg" CHECK ((balance >= 0)),
  CONSTRAINT "bonus_accounts_pkey" PRIMARY KEY (customer_id)
);

ALTER TABLE "public"."bonus_accounts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."bonus_transactions" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" uuid                     NOT NULL,
  "order_id"    uuid,
  "type"        text                     NOT NULL,
  "amount"      integer                  NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bonus_transactions_amount_check" CHECK ((amount > 0)),
  CONSTRAINT "bonus_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "bonus_transactions_type_check" CHECK ((type = ANY (ARRAY['earn'::text, 'redeem'::text, 'refund'::text])))
);

ALTER TABLE "public"."bonus_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."order_items" (
  "id"           uuid          NOT NULL DEFAULT gen_random_uuid(),
  "order_id"     uuid,
  "product_name" text          NOT NULL,
  "quantity"     integer       NOT NULL DEFAULT 1,
  "price"        numeric(10,2) NOT NULL,
  "product_id"   uuid,
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."order_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."orders" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_number"        integer                  NOT NULL DEFAULT nextval('public.orders_order_number_seq'::regclass),
  "customer_id"         uuid,
  "total"               numeric(10,2)            NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now(),
  "updated_at"          timestamp with time zone DEFAULT now(),
  "bonus_redeemed"      integer                  NOT NULL DEFAULT 0,
  "bonus_earned"        integer                  NOT NULL DEFAULT 0,
  "bonus_refunded"      boolean                  NOT NULL DEFAULT false,
  "idempotency_key"     uuid,
  "request_fingerprint" jsonb,
  "subtotal"            numeric(10,2),
  "discount_total"      numeric(10,2),
  "promo_code"          text,
  "reward_applied"      boolean,
  "reward_discount"     numeric(10,2),
  CONSTRAINT "orders_bonus_redeemed_nonneg" CHECK ((bonus_redeemed >= 0)),
  CONSTRAINT "orders_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."orders"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."phone_verifications" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "phone"      text                     NOT NULL,
  "request_id" text                     NOT NULL,
  "consumed"   boolean                  NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "phone_verifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."phone_verifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."products" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "sbis_id"            integer                  NOT NULL,
  "name"               text                     NOT NULL,
  "description"        text,
  "category"           text                     NOT NULL,
  "price"              numeric(10,2)            NOT NULL,
  "image_url"          text,
  "is_visible"         boolean                  NOT NULL DEFAULT false,
  "is_quick_pick"      boolean                  NOT NULL DEFAULT false,
  "badge"              text,
  "sort_order"         integer                  NOT NULL DEFAULT 0,
  "raw_payload"        jsonb,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "image_override_url" text,
  "subcategory"        text,
  "menu_category"      text,
  "menu_subcategory"   text,
  "display_name"       text,
  "is_modifier"        boolean                  NOT NULL DEFAULT false,
  "tags"               text[],
  CONSTRAINT "products_pkey" PRIMARY KEY (id),
  CONSTRAINT "products_sbis_id_key" UNIQUE (sbis_id)
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."promo_banners" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"      text                     NOT NULL,
  "subtitle"   text,
  "product_id" text,
  "starts_at"  timestamp with time zone NOT NULL,
  "ends_at"    timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "promo_banners_pkey" PRIMARY KEY (id),
  CONSTRAINT "promo_banners_valid_range" CHECK ((ends_at > starts_at))
);

ALTER TABLE "public"."promo_banners"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staff" (
  "user_id" uuid NOT NULL,
  CONSTRAINT "staff_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."staff"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sync_runs" (
  "id"              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "started_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at"     timestamp with time zone,
  "status"          text                     NOT NULL,
  "total_fetched"   integer,
  "sellable_items"  integer,
  "inserted"        integer,
  "updated"         integer,
  "price_anomalies" jsonb,
  "error_message"   text,
  CONSTRAINT "sync_runs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sync_runs"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."orders_order_number_seq" OWNED BY "public"."orders"."order_number";

CREATE TYPE "public"."order_status" AS ENUM (
  'new',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled'
);

ALTER TABLE "public"."orders"
  ADD COLUMN "status" public.order_status NOT NULL DEFAULT 'new'::public.order_status;

CREATE OR REPLACE FUNCTION public.bonus_rate_for (
  p_lifetime_paid numeric
)
  RETURNS numeric
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select case
    when p_lifetime_paid > 30000 then 0.15
    when p_lifetime_paid > 10000 then 0.10
    else 0.05
  end;
$function$;

CREATE OR REPLACE FUNCTION public.create_order (
  p_idempotency_key  uuid,
  p_items            jsonb,
  p_promo_code       text    DEFAULT NULL::text,
  p_reward_requested boolean DEFAULT false,
  p_bonus_redeem     numeric DEFAULT 0
)
  RETURNS TABLE (
    id              uuid,
    order_number    integer,
    status          public.order_status,
    total           numeric,
    subtotal        numeric,
    discount_total  numeric,
    bonus_redeemed  integer,
    reward_applied  boolean,
    reward_discount numeric,
    created_at      timestamp with time zone,
    idempotency_key uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_column
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
  -- ── Вставка сделана через EXECUTE на сырую строку SQL (а не напрямую)
  -- специально: PL/pgSQL пытается статически сопоставить КАЖДОЕ голое имя
  -- в теле функции со своими переменными/OUT-параметрами, и в списке
  -- `on conflict (...)` это сопоставление происходит даже при включённой
  -- `#variable_conflict use_column` (она помогает только в обычных
  -- SQL-выражениях, а не в списке колонок ON CONFLICT). Единственный
  -- надёжный способ полностью убрать эту неоднозначность — отдать Postgres
  -- запрос как обычную строку SQL через EXECUTE: внутри неё "idempotency_key"
  -- может означать только колонку таблицы, никакой PL/pgSQL-переменной там
  -- по определению быть не может. ──────────────────────────────────────────
  execute $q$
    insert into public.orders (
      customer_id, status, total, subtotal, discount_total, promo_code,
      reward_applied, reward_discount, bonus_redeemed, idempotency_key, request_fingerprint
    )
    values ($1, 'new'::public.order_status, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict (customer_id, idempotency_key) where idempotency_key is not null do nothing
    returning id
  $q$
  into v_order_id
  using v_customer_id, v_total, v_subtotal, v_discount_total, v_promo_code,
        v_reward_applied, v_reward_discount, v_bonus_redeem, p_idempotency_key, v_fingerprint;
 
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
$function$;

REVOKE ALL ON FUNCTION "public"."create_order"(uuid, jsonb, text, boolean, numeric) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.get_order_by_idempotency_key (
  p_idempotency_key uuid
)
  RETURNS TABLE (
    id                  uuid,
    order_number        integer,
    status              public.order_status,
    total               numeric,
    bonus_redeemed      integer,
    reward_applied      boolean,
    created_at          timestamp with time zone,
    idempotency_key     uuid,
    request_fingerprint jsonb
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select o.id, o.order_number, o.status, o.total, o.bonus_redeemed,
         o.reward_applied, o.created_at, o.idempotency_key, o.request_fingerprint
  from public.orders o
  where o.customer_id = auth.uid()
    and o.idempotency_key = p_idempotency_key;
$function$;

REVOKE ALL ON FUNCTION "public"."get_order_by_idempotency_key"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.handle_order_bonus_redeem()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_balance integer;
  v_max_redeemable integer;
begin
  if new.bonus_redeemed = 0 or new.customer_id is null then
    return new;
  end if;

  if new.bonus_redeemed < 0 then
    raise exception 'bonus_redeemed cannot be negative';
  end if;

  v_max_redeemable := floor(new.total * 0.5);
  if new.bonus_redeemed > v_max_redeemable then
    raise exception 'bonus_redeemed exceeds 50%% of order total (max %)', v_max_redeemable;
  end if;

  select balance into v_balance from public.bonus_accounts where customer_id = new.customer_id for update;
  v_balance := coalesce(v_balance, 0);

  if new.bonus_redeemed > v_balance then
    raise exception 'insufficient bonus balance (have %, requested %)', v_balance, new.bonus_redeemed;
  end if;

  -- Дошли сюда только если v_balance >= bonus_redeemed > 0, а значит строка
  -- в bonus_accounts уже существует (и заблокирована предыдущим SELECT ...
  -- FOR UPDATE) — plain UPDATE, без upsert.
  update public.bonus_accounts
    set balance = balance - new.bonus_redeemed,
        updated_at = now()
    where customer_id = new.customer_id;

  insert into public.bonus_transactions (customer_id, order_id, type, amount)
    values (new.customer_id, new.id, 'redeem', new.bonus_redeemed);

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_order_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_cash_paid numeric;
  v_lifetime_paid numeric;
  v_rate numeric;
  v_earned integer;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    v_cash_paid := greatest(new.total - new.bonus_redeemed, 0);

    select coalesce(lifetime_paid, 0) into v_lifetime_paid
      from public.bonus_accounts where customer_id = new.customer_id;
    v_lifetime_paid := coalesce(v_lifetime_paid, 0);

    -- Ставка берётся по уровню НА МОМЕНТ этой покупки (до её зачёта в
    -- lifetime_paid) — покупка, которая перевела клиента на новый уровень,
    -- ещё кэшбечится по старой ставке, новый уровень открывает следующие.
    v_rate := public.bonus_rate_for(v_lifetime_paid);
    v_earned := floor(v_cash_paid * v_rate);

    insert into public.bonus_accounts (customer_id, balance, lifetime_paid)
      values (new.customer_id, v_earned, v_cash_paid)
    on conflict (customer_id) do update
      set balance = public.bonus_accounts.balance + excluded.balance,
          lifetime_paid = public.bonus_accounts.lifetime_paid + excluded.lifetime_paid,
          updated_at = now();

    if v_earned > 0 then
      insert into public.bonus_transactions (customer_id, order_id, type, amount)
        values (new.customer_id, new.id, 'earn', v_earned);
    end if;

    new.bonus_earned := v_earned;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.bonus_redeemed > 0 and not new.bonus_refunded then
      insert into public.bonus_accounts (customer_id, balance)
        values (new.customer_id, new.bonus_redeemed)
      on conflict (customer_id) do update
        set balance = public.bonus_accounts.balance + excluded.balance,
            updated_at = now();

      insert into public.bonus_transactions (customer_id, order_id, type, amount)
        values (new.customer_id, new.id, 'refund', new.bonus_redeemed);

      new.bonus_refunded := true;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."bonus_accounts"
  ADD CONSTRAINT "bonus_accounts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."bonus_transactions"
  ADD CONSTRAINT "bonus_transactions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id);

ALTER TABLE "public"."bonus_transactions"
  ADD CONSTRAINT "bonus_transactions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE "public"."order_items"
  ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."phone_verifications"
  ADD CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."order_items"
  ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE "public"."staff"
  ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE INDEX bonus_transactions_customer_id_idx ON public.bonus_transactions USING btree (customer_id);

CREATE INDEX bonus_transactions_order_id_idx ON public.bonus_transactions USING btree (order_id);

CREATE UNIQUE INDEX orders_customer_idempotency_key_uniq ON public.orders USING btree (customer_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL);

CREATE INDEX phone_verifications_user_id_idx ON public.phone_verifications USING btree (user_id);

CREATE INDEX products_visible_category_idx ON public.products USING btree (is_visible, category, sort_order);

CREATE INDEX promo_banners_active_range_idx ON public.promo_banners USING btree (starts_at, ends_at);

CREATE INDEX sync_runs_started_at_idx ON public.sync_runs USING btree (started_at DESC);

CREATE TRIGGER orders_bonus_redeem_trigger
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_bonus_redeem();

CREATE TRIGGER orders_status_bonus_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_status_change();

CREATE POLICY "clients see own bonus account" ON "public"."bonus_accounts"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = customer_id));

CREATE POLICY "staff full access bonus accounts" ON "public"."bonus_accounts"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE (staff.user_id = auth.uid()))));

CREATE POLICY "clients see own bonus transactions" ON "public"."bonus_transactions"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = customer_id));

CREATE POLICY "staff full access bonus transactions" ON "public"."bonus_transactions"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE (staff.user_id = auth.uid()))));

CREATE POLICY "clients see own order items" ON "public"."order_items"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND (orders.customer_id = auth.uid())))));

CREATE POLICY "staff full access order items" ON "public"."order_items"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE (staff.user_id = auth.uid()))));

CREATE POLICY "clients see own orders" ON "public"."orders"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = customer_id));

CREATE POLICY "staff full access orders" ON "public"."orders"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE (staff.user_id = auth.uid()))));

CREATE POLICY "Products are readable by everyone" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "anyone can read promo banners" ON "public"."promo_banners"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "staff full access promo banners" ON "public"."promo_banners"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE (staff.user_id = auth.uid()))));

CREATE POLICY "staff can read own row" ON "public"."staff"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Sync runs are readable by everyone" ON "public"."sync_runs"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."order_items";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."orders";

COMMENT ON COLUMN "public"."order_items"."product_id" IS 'Ссылка на public.products на момент заказа. NULL для всех 14 строк, существовавших до этой миграции (сознательно не бэкфилленных — см. комментарий выше), и снова NULL, если товар впоследствии был удалён из products (ON DELETE SET NULL) — product_name/price при этом остаются нетронутым историческим снимком. Каждая НОВАЯ строка, созданная через create_order(), всегда имеет product_id.';

COMMENT ON COLUMN "public"."orders"."discount_total" IS 'Скидка по промокоду (сейчас — фиксированные 10% по коду SBL10, как и раньше на клиенте). НЕ включает bonus_redeemed. NULL — заказ создан до Block 1, разбивка неизвестна (НЕ означает "скидки не было").';

COMMENT ON COLUMN "public"."orders"."idempotency_key" IS 'Ключ одной попытки оформления заказа с клиента (генерируется один раз на попытку, переиспользуется при retry той же попытки, переживает даже перезапуск приложения — см. lib/orderService.js pending-checkout-attempt). NULL для заказов, созданных до этой миграции, а также для заказов, создаваемых сотрудниками напрямую (staff-flow не проходит через create_order() и не обязан иметь ключ) — НОВЫЕ заказы через create_order() всегда получают ключ, NULL для них невозможен (raise exception, если p_idempotency_key is null).';

COMMENT ON COLUMN "public"."orders"."promo_code" IS 'Промокод, который клиент указал при оформлении (после normalize: trim+upper). NULL, если не применялся, был неверным, либо заказ создан до Block 1.';

COMMENT ON COLUMN "public"."orders"."request_fingerprint" IS 'Канонический jsonb-снимок присланных товаров (отсортированных по product_id, после агрегации дублей) + промокода + reward-флага + суммы списания бонусов на момент создания заказа. Используется ТОЛЬКО для проверки повторного использования idempotency_key (сравнение через IS DISTINCT FROM) — НЕ участвует в расчёте цены. Источник истины — этот серверный расчёт; клиент присылает свой fingerprint (см. lib/orderService.js buildRequestFingerprint) только для локального "корзина не изменилась?", сервер ему не доверяет и никогда не принимает как параметр.';

COMMENT ON COLUMN "public"."orders"."reward_applied" IS 'true/false, если create_order() определённо применил/не применил награду "бесплатный десерт" — сервер проверяет только формальную применимость (есть ли в корзине десерт), НЕ факт того, что награда реально заработана (см. секцию 6 в теле функции). NULL — заказ создан до Block 1, неизвестно.';

COMMENT ON COLUMN "public"."orders"."reward_discount" IS 'Сумма, на которую уменьшен total из-за reward_applied = true. 0 (не NULL), если новый заказ создан БЕЗ награды — это точно известное значение. NULL — заказ создан до Block 1.';

COMMENT ON COLUMN "public"."orders"."subtotal" IS 'Сумма quantity*price по актуальным ценам products на момент заказа, ДО промокода и ДО награды лояльности. Считается только на сервере, в create_order(). NULL для заказов, созданных до Block 1 (breakdown не существовал).';

COMMENT ON COLUMN "public"."products"."display_name" IS 'Человеко-понятное название для карточки товара (например "Капучино" вместо "Кофе Капучино маленький"). Если пусто — используется исходное имя из СБИС.';

COMMENT ON COLUMN "public"."products"."image_override_url" IS 'Ручная ссылка на фото товара. Если задана — приложение показывает её вместо фото из СБИС. Синхронизация эту колонку не трогает.';

COMMENT ON COLUMN "public"."products"."is_modifier" IS 'true = это добавка/модификатор ("+ сыр 20 гр", молоко, сироп), не самостоятельная позиция меню — никогда не показывается в каталоге.';

COMMENT ON COLUMN "public"."products"."menu_category" IS 'Раздел меню для покупателя: Напитки / Еда / Десерты / Магазин. Ручная разметка, синхронизация не трогает.';

COMMENT ON COLUMN "public"."products"."menu_subcategory" IS 'Под-раздел внутри menu_category (например "Кофе", "Авторский кофе"). Ручная разметка.';

COMMENT ON COLUMN "public"."products"."subcategory" IS 'Прямая родительская папка товара в СБИС (может совпадать с category, если под-папки нет). Заполняется синхронизацией, только для чтения/анализа на данный момент.';

COMMENT ON FUNCTION "public"."get_order_by_idempotency_key"(uuid) IS 'Только чтение: находит заказ текущего пользователя (auth.uid()) по idempotency_key. Никогда не создаёт заказ. Возвращает request_fingerprint, чтобы вызывающий клиент мог локально сверить, совпадает ли найденный заказ с текущим содержимым корзины (см. lib/orderService.js recoverPendingCheckoutOnce), не доверяя собственному клиентскому fingerprint как источнику истины.';

GRANT EXECUTE ON FUNCTION "public"."bonus_rate_for"(numeric) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_order"(uuid, jsonb, text, boolean, numeric) TO "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_order_by_idempotency_key"(uuid) TO "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_order_bonus_redeem"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_order_status_change"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."orders_order_number_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bonus_accounts" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bonus_transactions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_items" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."phone_verifications" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."promo_banners" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sync_runs" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."order_status" TO "postgres";

