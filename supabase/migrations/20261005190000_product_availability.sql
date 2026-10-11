BEGIN;
ALTER TABLE public.products ADD COLUMN is_available boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.products.is_available IS 'Manual stop-list availability, independent of menu visibility and catalog synchronization.';
CREATE OR REPLACE FUNCTION public.create_order (
  p_idempotency_key  uuid,
  p_items            jsonb,
  p_promo_code       text    DEFAULT NULL::text,
  p_reward_requested boolean DEFAULT false,
  p_bonus_redeem     numeric DEFAULT 0,
  p_quote jsonb DEFAULT NULL
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
  v_entitlement_id uuid;
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
 
  -- Serialize retries, reward selection, and completion for one customer.
  insert into public.reward_progress(customer_id) values(v_customer_id) on conflict do nothing;
  perform 1 from public.reward_progress where customer_id=v_customer_id for update;
  if p_quote is null or jsonb_typeof(p_quote) is distinct from 'object'
     or jsonb_typeof(p_quote->'items') is distinct from 'array'
     or jsonb_typeof(p_quote->'payable') is distinct from 'number' then
    raise exception 'QUOTE_REQUIRED: Expected prices and payable amount are required.' using errcode='22023';
  end if;
  if jsonb_array_length(p_quote->'items') > 50 or pg_column_size(p_quote) > 16384 then
    raise exception 'INVALID_PAYLOAD: Quote is too large.' using errcode='22023';
  end if;
  if (p_quote->>'payable')::numeric < 0 or (p_quote->>'payable')::numeric > 1000000000
     or (p_quote->>'payable')::numeric <> round((p_quote->>'payable')::numeric,2) then
    raise exception 'INVALID_PAYLOAD: Invalid quote amount.' using errcode='22023';
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
    'bonus_redeem', v_bonus_redeem, 'quote', p_quote
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
  -- Visibility and manual availability are independent. Product row locks
  -- serialize checkout against a staff stop-list update. No stock quantities.
  select count(*) into v_matched_count
  from (
    select x.product_id
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by x.product_id
  ) x
  join public.products p on p.id = x.product_id and p.is_visible = true and p.is_available = true and p.is_modifier = false;
 
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
 
  -- Reward preference is not proof of entitlement.
  if v_reward_requested then
    select r.id into v_entitlement_id from public.reward_entitlements r
    where r.customer_id=v_customer_id and r.redeemed_at is null and r.expires_at>clock_timestamp()
    order by r.earned_at,r.id limit 1 for update;
  end if;
  if v_entitlement_id is not null then
    select p.id, p.price
      into v_reward_product_id, v_reward_unit_price
    from (
      select x.product_id, sum(x.quantity)::int as quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
      group by x.product_id
    ) x
    join public.products p on p.id = x.product_id and p.is_visible = true and p.is_available = true and p.is_modifier = false
    where p.menu_category = c_dessert_category
    order by p.price asc, p.id asc
    limit 1;
 
    if v_reward_product_id is not null then
      v_reward_discount := v_reward_unit_price;
      v_reward_applied := true;
    else
      v_entitlement_id := null;
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
  -- Product rows and customer reward progress are already locked. Compare the
  -- user's quote before any order, bonus debit, or reward consumption is written.
  if p_quote->'items' is distinct from (
    select jsonb_agg(jsonb_build_array(x.product_id,x.quantity,p.price) order by x.product_id)
    from (select z.product_id,sum(z.quantity)::int as quantity
          from jsonb_to_recordset(p_items) z(product_id uuid,quantity int) group by z.product_id) x
    join public.products p on p.id=x.product_id
  ) or (p_quote->>'payable')::numeric is distinct from (v_total-v_bonus_redeem) then
    raise exception 'PRICE_CHANGED: Review the updated cart before ordering.' using errcode='22023';
  end if;
 
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
      reward_applied, reward_discount, bonus_redeemed, idempotency_key, request_fingerprint, reward_entitlement_id
    )
    values ($1, 'new'::public.order_status, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    on conflict (customer_id, idempotency_key) where idempotency_key is not null do nothing
    returning id
  $q$
  into v_order_id
  using v_customer_id, v_total, v_subtotal, v_discount_total, v_promo_code,
        v_reward_applied, v_reward_discount, v_bonus_redeem, p_idempotency_key, v_fingerprint, v_entitlement_id;
 
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

CREATE FUNCTION public.set_product_availability(p_product_id uuid,p_available boolean,p_expected boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_available IS NULL OR p_expected IS NULL THEN
  RAISE EXCEPTION 'INVALID_PAYLOAD: availability required' USING ERRCODE='22023';
 END IF;
 UPDATE public.products SET is_available=p_available,updated_at=clock_timestamp()
 WHERE id=p_product_id AND is_available=p_expected;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'AVAILABILITY_CHANGED: refresh stop list' USING ERRCODE='22023';
 END IF;
 RETURN p_available;
END $$;
REVOKE ALL ON FUNCTION public.set_product_availability(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_product_availability(uuid,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.create_order(uuid,jsonb,text,boolean,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,jsonb,text,boolean,numeric,jsonb) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

