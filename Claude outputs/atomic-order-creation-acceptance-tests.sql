-- atomic-order-creation-acceptance-tests.sql
--
-- ═════════════════════════════════════════════════════════════════════════
-- ЭТО MANUAL TEST RUNBOOK, НЕ автоматизированный test-suite.
--
-- НЕ запускать файл целиком одной кнопкой ("Run all") в Supabase SQL
-- Editor. Каждый TEST N ниже — это ОТДЕЛЬНЫЙ, самостоятельный
-- BEGIN...ROLLBACK блок, который нужно выделять и выполнять по одному.
-- Причины: (а) некоторые тесты (7, 10, 11, 12 и др.) ОЖИДАЮТ, что SQL
-- упадёт с конкретной ошибкой — если выполнять весь файл одним batch,
-- большинство SQL-клиентов (включая Supabase SQL Editor) останавливают
-- выполнение всего скрипта на первой же ошибке, и все тесты ПОСЛЕ неё
-- просто не выполнятся, а это будет выглядеть как "всё сломалось", хотя
-- на самом деле сломалось только исполнение runbook'а; (б) `set local
-- role`/`set local request.jwt.claims` внутри одной транзакции не должны
-- "утекать" в соседний тест — раздельные BEGIN...ROLLBACK это гарантируют,
-- общий batch — нет.
--
-- Ожидаемая ошибка (`raise exception 'КОД: ...'` внутри create_order(),
-- либо ошибка RLS/permission denied от самого Postgres) засчитывается как
-- PASS ТОЛЬКО если текст/код ошибки совпадает с тем, что написано в
-- комментарии "Ожидается:" под запросом — а не любая ошибка вообще. Если
-- вылезла другая ошибка (например, синтаксическая, или "relation does not
-- exist") — это FAIL самого теста (или дефект теста), а не подтверждение
-- защиты.
-- ═════════════════════════════════════════════════════════════════════════
--
-- Ручные acceptance-тесты для create_order() / get_order_by_idempotency_key()
-- из supabase/migrations/20260911120000_atomic_order_creation.sql.
--
-- Block 1.5: полностью переписаны под РЕАЛЬНУЮ схему production (см. секцию Z
-- задания Block 1.5) — раньше тесты были написаны по частично предполагаемым
-- типам/структуре. Добавлены тесты на is_modifier, на новую RLS-политику
-- (прямой INSERT клиента должен теперь отклоняться), и на bonus/cash_paid
-- семантику. Как и раньше, я НЕ СМОГЛА выполнить эти тесты сама — в этой
-- сессии нет прямого доступа к Postgres проекта. Это готовые запросы для
-- Supabase Dashboard -> SQL Editor: каждый блок обёрнут в BEGIN...ROLLBACK —
-- реальные данные не меняются, даже если что-то пойдёт не так.
--
-- Каждый DO-блок сам находит реальные товары из каталога через
-- is_visible = true and is_modifier = false (там, где нужен товар, который
-- ДОЛЖЕН приниматься), либо явно is_modifier = true (там, где нужен товар,
-- который ДОЛЖЕН отклоняться) — конкретные id знать не нужно.
--
-- auth.uid() внутри SQL Editor обычно NULL (сессия администратора, не
-- конкретного покупателя) — тесты подставляют auth.uid() через
-- `set local role authenticated` + `set local request.jwt.claims`. Замени
-- 'REPLACE_WITH_REAL_CUSTOMER_ID' на реальный customer_id (например,
-- `select customer_id from public.orders where customer_id is not null limit 1;`)
-- либо на любой существующий auth.users.id, если хочешь тестировать "чистого"
-- покупателя без старых заказов.
--
-- ─────────────────────────────────────────────────────────────────────────
-- МЕТОДОЛОГИЯ (Block 1.6): как именно тестируется каждый тип вызывающего.
--
-- По умолчанию Supabase SQL Editor выполняет запросы как роль `postgres`
-- (владелец схемы / суперпользователь) — у неё либо BYPASSRLS, либо она
-- владелец таблиц, поэтому RLS-политики на неё НЕ действуют, а GRANT/REVOKE
-- на функции для неё не имеют значения (суперпользователь обходит проверки
-- прав). Тест, выполненный БЕЗ `set local role`, НИЧЕГО не говорит ни об
-- RLS, ни о REVOKE — он проверяет только внутреннюю бизнес-логику функции.
--
-- Поэтому каждый сценарий ниже явно переключает роль:
--   • ordinary customer -> `set local role authenticated` +
--     `set local request.jwt.claims = '{"sub": "<uuid>", "role": "authenticated"}'`
--     (это переключает и Postgres-роль для privilege/RLS-проверок, и то, что
--     вернёт auth.uid(), т.к. auth.uid() читает request.jwt.claims->>'sub').
--   • staff -> тот же механизм, но с sub существующего public.staff.user_id.
--   • unauthenticated / anon -> `set local role anon` БЕЗ request.jwt.claims.
--
-- ПОДТВЕРЖДЕНО (Block 1.6.2, реальная проверка `select rolname, rolsuper,
-- rolbypassrls from pg_roles where rolname in ('anon','authenticated');`
-- в этом проекте) — это больше НЕ допущение:
--   authenticated: rolsuper = false, rolbypassrls = false
--   anon:          rolsuper = false, rolbypassrls = false
-- Ни одна из этих ролей не является суперпользователем и не имеет
-- BYPASSRLS — значит `set local role authenticated`/`set local role anon`
-- действительно ставит вызывающего под реальные RLS-политики и реальные
-- GRANT/REVOKE проверки, а не молча продолжает работать с правами
-- table owner. RLS-тесты (17-19) и REVOKE-тест (1) валидны по построению,
-- а не только "по стандартной конфигурации Supabase".
-- ─────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 1 — unauthenticated/anon caller: EXECUTE на create_order() ОТОЗВАН
-- (revoke all ... from anon в миграции) — вызов должен упасть с ошибкой
-- прав доступа (permission denied for function, sqlstate 42501) ДО того,
-- как выполнится хоть одна строка тела функции. Это отдельная проверка от
-- TEST 2 ниже: здесь проверяется GRANT/REVOKE, а не бизнес-логика
-- NOT_AUTHENTICATED внутри функции.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role anon;
  select public.create_order(gen_random_uuid(), '[]'::jsonb, null, false, 0);
  -- Ожидается: permission denied for function create_order (42501) —
  -- НЕ "корзина пуста" и НЕ NOT_AUTHENTICATED. Если вылезла любая другая
  -- ошибка — значит REVOKE ALL ... FROM anon не подействовал.
rollback;

begin;
  set local role anon;
  select public.get_order_by_idempotency_key(gen_random_uuid());
  -- Ожидается: тот же permission denied for function (42501).
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 2 — authenticated-роль, но БЕЗ request.jwt.claims (auth.uid() is
-- null) — функция обязана отказать сама, на уровне бизнес-логики
-- (NOT_AUTHENTICATED), а не полагаться только на RLS/GRANT. Это тест ИМЕННО
-- защиты внутри create_order(), т.к. EXECUTE у authenticated есть (иначе ни
-- один настоящий пользователь не смог бы вызвать функцию вообще).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  -- request.jwt.claims сознательно НЕ устанавливается.
  select public.create_order(gen_random_uuid(), '[]'::jsonb, null, false, 0);
  -- Ожидается: NOT_AUTHENTICATED (не 42501 — EXECUTE есть, но auth.uid() null)
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 3 — обычный заказ: orders + order_items создаются, customer_id =
-- auth.uid(), order_items имеют product_id + snapshot product_name + цену из
-- products (не из клиента).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare
    v_p1 uuid; v_p2 uuid; v_key uuid := gen_random_uuid(); v_items jsonb;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false order by id limit 1;
    select id into v_p2 from public.products where is_visible = true and is_modifier = false order by id offset 1 limit 1;
    v_items := jsonb_build_array(
      jsonb_build_object('product_id', v_p1, 'quantity', 2),
      jsonb_build_object('product_id', v_p2, 'quantity', 1)
    );
    perform * from public.create_order(v_key, v_items, null, false, 0);
    raise notice 'TEST 3 idempotency_key = %', v_key;
  end $$;

  -- Проверка: ровно 1 заказ, ровно 2 order_items, customer_id = наш sub,
  -- каждый order_item.product_id заполнен и product_name/price не NULL.
  select o.id, o.customer_id, o.total, o.subtotal, count(oi.*) as item_rows,
         bool_and(oi.product_id is not null) as all_have_product_id,
         bool_and(oi.product_name is not null and oi.price is not null) as all_have_snapshot
  from public.orders o join public.order_items oi on oi.order_id = o.id
  group by o.id, o.customer_id, o.total, o.subtotal
  order by o.created_at desc limit 1;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 4 — подделать цену/total клиент не может: в p_items физически нет
-- поля price — сравниваем итог с products.price, а не пытаемся "подсунуть" цену.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare
    v_p1 uuid; v_real_price numeric; v_key uuid := gen_random_uuid();
    v_items jsonb; v_server_total numeric;
  begin
    select id, price into v_p1, v_real_price from public.products where is_visible = true and is_modifier = false limit 1;
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 3));
    select total into v_server_total from public.create_order(v_key, v_items, null, false, 0);

    if v_server_total = v_real_price * 3 then
      raise notice 'TEST 4 OK: server total % = реальная цена % * 3', v_server_total, v_real_price;
    else
      raise exception 'TEST 4 FAILED: server total % != % * 3', v_server_total, v_real_price;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 5 — тот же idempotency_key + тот же payload дважды подряд: в БД один
-- order, второй вызов возвращает ТЕ ЖЕ данные (эмулирует "response потерян,
-- retry тем же ключом").
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare
    v_p1 uuid; v_key uuid := gen_random_uuid(); v_items jsonb;
    v_id1 uuid; v_id2 uuid;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1));

    select id into v_id1 from public.create_order(v_key, v_items, null, false, 0);
    select id into v_id2 from public.create_order(v_key, v_items, null, false, 0); -- "retry"

    if v_id1 = v_id2 then
      raise notice 'TEST 5 OK: оба вызова вернули один и тот же order id = %', v_id1;
    else
      raise exception 'TEST 5 FAILED: id1=% != id2=%', v_id1, v_id2;
    end if;
  end $$;

  select count(*) as orders_with_this_key from public.orders
  where idempotency_key is not null
  group by customer_id, idempotency_key
  having count(*) > 1; -- НИЧЕГО не должно вернуться
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 6 — тот же idempotency_key, но ДРУГОЙ payload: первый заказ обязан
-- РЕАЛЬНО остаться в БД, второй — упасть с IDEMPOTENCY_CONFLICT и не
-- создать ничего. Block 1.6.1: раньше второй вызов кидал исключение НАРУЖУ
-- из DO-блока, поэтому вся окружающая транзакция уходила в error-state и
-- откатывала вместе с ней и ПЕРВЫЙ (успешный) заказ тоже — тест доказывал
-- только "конфликт случился", но не "первый заказ выжил, второй не создан".
-- Теперь второй вызов обёрнут во вложенный BEGIN...EXCEPTION, чтобы поймать
-- IDEMPOTENCY_CONFLICT локально и затем явно проверить состояние БД.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare
    v_p1 uuid; v_p2 uuid; v_key uuid := gen_random_uuid();
    v_first_id uuid; v_second_id uuid; v_conflict_caught boolean := false;
    v_count int; v_stored_id uuid; v_stored_fingerprint jsonb;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false order by id limit 1;
    select id into v_p2 from public.products where is_visible = true and is_modifier = false order by id offset 1 limit 1;

    -- Первый вызов — payload A, должен успешно создать заказ.
    select id into v_first_id from public.create_order(
      v_key, jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)), null, false, 0
    );

    -- Второй вызов — тот же ключ, ДРУГОЙ payload (B). Ловим исключение
    -- ЛОКАЛЬНО, чтобы первый заказ не откатился вместе с ним.
    begin
      select id into v_second_id from public.create_order(
        v_key, jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 2)), null, false, 0
      );
    exception when others then
      if sqlerrm like 'IDEMPOTENCY_CONFLICT:%' then
        v_conflict_caught := true;
      else
        raise exception 'TEST 6 FAILED: ожидалась IDEMPOTENCY_CONFLICT, получено: %', sqlerrm;
      end if;
    end;

    if not v_conflict_caught then
      raise exception 'TEST 6 FAILED: второй вызов с другим payload НЕ вызвал исключение (id=%)', v_second_id;
    end if;

    -- Проверка 1: ровно один заказ с этим (customer_id, idempotency_key).
    select count(*) into v_count from public.orders
    where customer_id = auth.uid() and idempotency_key = v_key;
    if v_count <> 1 then
      raise exception 'TEST 6 FAILED: ожидался ровно 1 заказ с этим ключом, найдено %', v_count;
    end if;

    -- Проверка 2: это именно ПЕРВЫЙ заказ (id совпадает).
    select id, request_fingerprint into v_stored_id, v_stored_fingerprint
    from public.orders where customer_id = auth.uid() and idempotency_key = v_key;
    if v_stored_id <> v_first_id then
      raise exception 'TEST 6 FAILED: сохранённый заказ % != первому вызову %', v_stored_id, v_first_id;
    end if;

    -- Проверка 3: request_fingerprint соответствует ПЕРВОМУ payload (v_p1),
    -- а не второму (v_p2).
    if (v_stored_fingerprint -> 'items' -> 0 ->> 'product_id')::uuid <> v_p1 then
      raise exception 'TEST 6 FAILED: request_fingerprint не соответствует первому payload: %', v_stored_fingerprint;
    end if;

    raise notice 'TEST 6 OK: первый заказ % сохранён, второй (другой payload) отклонён IDEMPOTENCY_CONFLICT, fingerprint соответствует первому payload', v_first_id;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 7 — несуществующий product_id: заказ не создаётся вообще (ни orders,
-- ни order_items).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  select public.create_order(
    gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid(), 'quantity', 1)),
    null, false, 0
  );
  -- Ожидается: PRODUCT_NOT_AVAILABLE
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 8 — товар с is_visible = false: отклоняется тем же PRODUCT_NOT_AVAILABLE.
-- Block 1.6.1: товар для теста выбирается ДОПОЛНИТЕЛЬНО с is_modifier = false
-- (не только is_visible = false) — иначе, если случайно попадётся товар,
-- который одновременно и невидим, И модификатор, отказ доказывал бы либо
-- одну причину, либо другую, либо обе сразу — тест должен изолированно
-- проверять именно is_visible.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid;
  begin
    select id into v_p1 from public.products where is_visible = false and is_modifier = false limit 1;
    if v_p1 is null then
      raise notice 'TEST 8 SKIPPED: нет ни одного products.is_visible = false AND is_modifier = false — не с чем изолированно проверить именно is_visible-причину отказа';
    else
      perform public.create_order(
        gen_random_uuid(),
        jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
        null, false, 0
      );
    end if;
  end $$;
  -- Ожидается (если товар найден): PRODUCT_NOT_AVAILABLE
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 9 — товар с is_modifier = true (модификатор, не самостоятельная
-- позиция меню): отклоняется тем же PRODUCT_NOT_AVAILABLE, даже если
-- is_visible = true. Block 1.6.1: товар выбирается ДОПОЛНИТЕЛЬНО с
-- is_visible = true (не просто is_modifier = true) — чтобы отказ доказывал
-- ИМЕННО modifier-защиту, а не совпадение с невидимостью товара (иначе
-- этот тест ничем не отличался бы по факту от TEST 8).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid;
  begin
    select id into v_p1 from public.products where is_modifier = true and is_visible = true limit 1;
    if v_p1 is null then
      raise notice 'TEST 9 SKIPPED: нет ни одного products.is_modifier = true AND is_visible = true — не с чем изолированно проверить именно modifier-причину отказа (возможно, все текущие модификаторы уже is_visible=false)';
    else
      perform public.create_order(
        gen_random_uuid(),
        jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
        null, false, 0
      );
    end if;
  end $$;
  -- Ожидается (если модификатор найден): PRODUCT_NOT_AVAILABLE
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 10 — quantity = 0: отклоняется.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
    perform public.create_order(
      gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 0)),
      null, false, 0
    );
  end $$;
  -- Ожидается: INVALID_PAYLOAD
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 11 — quantity одной позиции > 50: отклоняется INVALID_QUANTITY.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
    perform public.create_order(
      gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 51)),
      null, false, 0
    );
  end $$;
  -- Ожидается: INVALID_QUANTITY (максимум 50 шт. на товар)
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 12 — больше 100 "сырых" строк в p_items (до агрегации): отклоняется
-- INVALID_PAYLOAD ещё до какой-либо обработки/агрегации.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid; v_items jsonb := '[]'::jsonb; i int;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
    for i in 1..101 loop
      v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1));
    end loop;
    perform public.create_order(gen_random_uuid(), v_items, null, false, 0);
  end $$;
  -- Ожидается: INVALID_PAYLOAD (слишком много позиций в запросе)
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 13 — ошибка внутри функции не оставляет partial-запись: если после
-- вставки orders что-то роняет всю транзакцию (превышение лимита бонусов —
-- тот же сценарий, что и TEST 14, здесь проверяется общий факт "ничего не
-- осталось"), то ни orders, ни order_items с ЭТИМ КОНКРЕТНЫМ ключом не
-- должно остаться. Block 1.6.1: раньше проверка смотрела "все orders с
-- bonus_redeemed > 0 за последнюю минуту" — это (а) могло дать
-- false-positive, если в БД параллельно/недавно появился другой легитимный
-- заказ с бонусами, и (б) могло дать false-negative, если тест выполняется
-- медленнее минуты. Теперь v_key остаётся в области видимости ОДНОГО DO-блока
-- и проверка идёт строго по (customer_id, idempotency_key) = (auth.uid(), v_key).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID_WITH_BONUS_BALANCE", "role": "authenticated"}';

  do $$
  declare
    v_p1 uuid; v_price numeric; v_key uuid := gen_random_uuid();
    v_orders_count int; v_items_count int;
  begin
    select id, price into v_p1, v_price from public.products where is_visible = true and is_modifier = false order by price asc limit 1;

    begin
      -- Списываем весь total бонусами -> должно быть больше лимита 50%, если price > 0.
      perform public.create_order(
        v_key,
        jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
        null, false, v_price
      );
    exception when others then
      raise notice 'TEST 13: create_order() упал как и ожидалось (%), проверяем ниже, что partial-записи с ключом % нет', sqlerrm, v_key;
    end;

    -- Проверка строго по этому ключу и этому customer_id — не "все недавние".
    select count(*) into v_orders_count from public.orders
    where customer_id = auth.uid() and idempotency_key = v_key;

    select count(*) into v_items_count from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.customer_id = auth.uid() and o.idempotency_key = v_key;

    if v_orders_count = 0 and v_items_count = 0 then
      raise notice 'TEST 13 OK: с ключом % не осталось ни orders (%), ни order_items (%)', v_key, v_orders_count, v_items_count;
    else
      raise exception 'TEST 13 FAILED: с ключом % осталось orders=%, order_items=% (ожидалось 0/0)', v_key, v_orders_count, v_items_count;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 14 — same, явная проверка через RETURNING/exception: бонусы > 50% total
-- откатывают ВСЮ вставку (orders + order_items), а не только order_items.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID_WITH_BONUS_BALANCE", "role": "authenticated"}';

  do $$
  declare v_p1 uuid; v_price numeric; v_key uuid := gen_random_uuid();
    v_orders_before int; v_orders_after int;
  begin
    select count(*) into v_orders_before from public.orders;
    select id, price into v_p1, v_price from public.products where is_visible = true and is_modifier = false order by price desc limit 1;

    begin
      perform public.create_order(
        v_key,
        jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
        null, false, v_price -- 100% бонусами, лимит - 50%
      );
    exception when others then
      raise notice 'TEST 14: ожидаемое исключение от handle_order_bonus_redeem: %', sqlerrm;
    end;

    select count(*) into v_orders_after from public.orders;
    if v_orders_after = v_orders_before then
      raise notice 'TEST 14 OK: количество orders не изменилось (%), partial-запись не осталась', v_orders_before;
    else
      raise exception 'TEST 14 FAILED: orders было %, стало % — осталась partial-запись!', v_orders_before, v_orders_after;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 15 — bonus_redeemed <= 50% total и <= реального balance: заказ
-- создаётся успешно, orders.total НЕ уменьшен на bonus_redeemed (total
-- остаётся "полной" ценой — вычитание происходит только в cash_paid при
-- переходе в completed, а не здесь).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID_WITH_BONUS_BALANCE", "role": "authenticated"}';

  do $$
  declare v_p1 uuid; v_price numeric; v_key uuid := gen_random_uuid();
    v_total numeric; v_bonus integer;
  begin
    select id, price into v_p1, v_price from public.products where is_visible = true and is_modifier = false order by price desc limit 1;
    select total, bonus_redeemed into v_total, v_bonus from public.create_order(
      v_key,
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
      null, false, floor(v_price * 0.3) -- заведомо меньше 50%
    );
    if v_total = v_price and v_bonus = floor(v_price * 0.3) then
      raise notice 'TEST 15 OK: total = % (полная цена, бонус НЕ вычтен), bonus_redeemed = %', v_total, v_bonus;
    else
      raise exception 'TEST 15 FAILED: total=%, ожидалось %, bonus_redeemed=%', v_total, v_price, v_bonus;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 16 — reward (бесплатный десерт) применяется только если в корзине
-- реально есть товар из menu_category = 'Десерты'; для не-десертной корзины
-- reward_applied = false, reward_discount = 0, даже если p_reward_requested = true.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid; v_key uuid := gen_random_uuid(); v_reward_applied boolean; v_reward_discount numeric;
  begin
    -- Явно НЕ десерт.
    select id into v_p1 from public.products
    where is_visible = true and is_modifier = false and menu_category is distinct from 'Десерты'
    limit 1;
    select reward_applied, reward_discount into v_reward_applied, v_reward_discount
    from public.create_order(v_key, jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)), null, true, 0);

    if v_reward_applied = false and v_reward_discount = 0 then
      raise notice 'TEST 16 OK: без десерта в корзине reward НЕ применён, даже при p_reward_requested=true';
    else
      raise exception 'TEST 16 FAILED: reward_applied=%, reward_discount=%', v_reward_applied, v_reward_discount;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 17 — прямой INSERT обычного (не staff) клиента в orders должен
-- отклоняться RLS ПОСЛЕ применения этой миграции (Block 1.5, секция 6:
-- "clients create own orders" удалена). До миграции этот INSERT проходил —
-- это и есть P0-дыра, которую закрывает эта миграция.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  insert into public.orders (customer_id, status, total)
  values (auth.uid(), 'new'::public.order_status, 0);
  -- Ожидается ПОСЛЕ применения миграции: ошибка RLS
  -- ("new row violates row-level security policy for table \"orders\"").
  -- Если этот INSERT проходит — миграция ещё не применена либо не сработала.
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 18 — аналогично для order_items: прямой INSERT обычного клиента
-- должен отклоняться RLS после миграции ("clients create own order items"
-- удалена).
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_order_id uuid; v_p1 uuid;
  begin
    -- Заказ создаём легитимно через create_order(), чтобы у клиента было
    -- "своё" order_id для попытки прямого добавления позиции.
    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
    select id into v_order_id from public.create_order(
      gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)), null, false, 0
    );

    insert into public.order_items (order_id, product_id, product_name, quantity, price)
    values (v_order_id, v_p1, 'Поддельная бесплатная позиция', 1, 0);
    -- Ожидается ПОСЛЕ применения миграции: ошибка RLS.
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 19 — staff-флоу НЕ должен быть сломан: сотрудник (есть строка в
-- public.staff с user_id = auth.uid()) по-прежнему может напрямую
-- insert/update orders/order_items — эти политики этой миграцией не трогаются.
-- Замени REPLACE_WITH_REAL_STAFF_USER_ID на реальный staff.user_id.
--
-- Block 1.6.2: усилено — раньше проверялся только INSERT в orders. Теперь
-- явно проверяются все три операции кассы/бариста-флоу: INSERT order,
-- INSERT order_item к этому order, и UPDATE order.status (new -> accepted)
-- — это ближе к реальному staff-сценарию (принять заказ, добавить позицию,
-- сменить статус), чем один голый INSERT. Production-данные не меняются —
-- весь блок внутри внешнего ROLLBACK.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_STAFF_USER_ID", "role": "authenticated"}';

  do $$
  declare
    v_is_staff boolean;
    v_order_id uuid;
    v_p1 uuid;
    v_status_after public.order_status;
  begin
    select exists(select 1 from public.staff where user_id = auth.uid()) into v_is_staff;
    if not v_is_staff then
      raise notice 'TEST 19 SKIPPED: указанный sub не найден в public.staff — подставь реальный staff user_id';
    else
      -- 1. INSERT order напрямую (минуя create_order()) — легитимный staff-флоу.
      insert into public.orders (customer_id, status, total)
      values (null, 'new'::public.order_status, 100)
      returning id into v_order_id;

      -- 2. INSERT order_item для этого order.
      select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
      insert into public.order_items (order_id, product_id, product_name, quantity, price)
      values (v_order_id, v_p1, 'TEST 19 staff item', 1, 100);

      -- 3. UPDATE order.status: new -> accepted (типичный переход кассы).
      update public.orders set status = 'accepted'::public.order_status where id = v_order_id;

      select status into v_status_after from public.orders where id = v_order_id;
      if v_status_after = 'accepted'::public.order_status then
        raise notice 'TEST 19 OK: staff INSERT order (%) + INSERT order_item + UPDATE status new->accepted все прошли (staff full access policy не тронута)', v_order_id;
      else
        raise exception 'TEST 19 FAILED: после UPDATE status = % (ожидалось accepted)', v_status_after;
      end if;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 20 — get_order_by_idempotency_key() НЕ создаёт заказ при отсутствии
-- совпадения: чисто read-only.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_count_before int; v_count_after int; v_result_count int;
  begin
    select count(*) into v_count_before from public.orders;
    select count(*) into v_result_count from public.get_order_by_idempotency_key(gen_random_uuid());
    select count(*) into v_count_after from public.orders;

    if v_result_count = 0 and v_count_before = v_count_after then
      raise notice 'TEST 20 OK: lookup случайного ключа вернул 0 строк, orders не изменились';
    else
      raise exception 'TEST 20 FAILED: result_count=%, orders до=%, после=%', v_result_count, v_count_before, v_count_after;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 21 — lookup ЧУЖОГО idempotency_key ничего не раскрывает (customer_id
-- фильтруется через auth.uid(), а не принимается параметром).
--
-- Block 1.6.1: старая версия искала "любой заказ НЕ принадлежащий
-- REPLACE_WITH_REAL_CUSTOMER_ID" среди уже существующих orders — но RLS
-- (SELECT-политика "clients see own orders") УЖЕ скрывает от authenticated
-- + claims=USER_A все заказы, кроме заказов USER_A, поэтому сам этот select
-- почти всегда возвращал 0 строк и тест сразу уходил в SKIPPED, ничего не
-- проверив по факту — SKIPPED ошибочно читался как "прошёл".
--
-- Правильный тест: два РЕАЛЬНЫХ auth.users id (USER_A и USER_B). Роль
-- authenticated НЕ меняется между шагами — меняется только
-- request.jwt.claims.sub, что и эмулирует "тот же Postgres-сеанс, но
-- другой реальный пользователь Supabase" (в проде это, конечно, два разных
-- HTTP-запроса с разными JWT, а не одна транзакция — здесь это допустимое
-- упрощение ИМЕННО для проверки того, что делает WHERE customer_id =
-- auth.uid() внутри функции, а не эмуляция сетевого уровня).
--
-- Замени REPLACE_WITH_REAL_USER_A_ID и REPLACE_WITH_REAL_USER_B_ID на два
-- РАЗНЫХ существующих auth.users.id. Если в проекте нет двух разных
-- реальных пользователей (например, тестовая среда с одним аккаунтом) —
-- этот тест помечается MANUAL/SETUP REQUIRED и результат SKIPPED НЕЛЬЗЯ
-- засчитывать как подтверждение безопасности lookup — только как
-- "тест не мог быть выполнен, нужно создать второго тестового пользователя".
-- ═════════════════════════════════════════════════════════════════════════
begin;
  do $$
  declare
    -- Block 1.6.2: сначала text, а не сразу ::uuid — незаменённый
    -- placeholder ('REPLACE_WITH_REAL_USER_A_ID' — не валидный uuid)
    -- раньше падал бы с "invalid input syntax for type uuid" прямо на
    -- объявлении переменной, ДО того, как успевал сработать MANUAL/SETUP
    -- REQUIRED notice ниже. Кастуем в uuid только после явной проверки.
    v_user_a_text text := 'REPLACE_WITH_REAL_USER_A_ID';
    v_user_b_text text := 'REPLACE_WITH_REAL_USER_B_ID';
    v_user_a uuid;
    v_user_b uuid;
    v_p1 uuid;
    v_key uuid := gen_random_uuid();
    v_lookup_count int;
  begin
    if v_user_a_text like 'REPLACE_WITH%' or v_user_b_text like 'REPLACE_WITH%' or v_user_a_text = v_user_b_text then
      raise notice 'TEST 21 MANUAL/SETUP REQUIRED: подставь два РАЗНЫХ реальных auth.users.id вместо REPLACE_WITH_REAL_USER_A_ID / REPLACE_WITH_REAL_USER_B_ID и перезапусти — этот прогон НИЧЕГО не проверил (не является PASS/SKIPPED в смысле "безопасно").';
      return;
    end if;

    -- Только теперь, после явной проверки, что placeholder заменён на два
    -- разных значения, пытаемся привести к uuid (если это не валидный uuid
    -- вообще — упадёт здесь с понятной ошибкой, а не молча "мимо" MANUAL/SETUP).
    v_user_a := v_user_a_text::uuid;
    v_user_b := v_user_b_text::uuid;

    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;

      -- Шаг 1: под USER_A создаём заказ с известным ключом.
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
      perform public.create_order(v_key, jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)), null, false, 0);

      -- Шаг 2: НЕ меняя роль authenticated, переключаем sub на USER_B и
      -- пытаемся получить чужой (принадлежащий USER_A) заказ по его ключу.
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
      select count(*) into v_lookup_count from public.get_order_by_idempotency_key(v_key);

    if v_lookup_count = 0 then
      raise notice 'TEST 21 OK: USER_B lookup ключа USER_A вернул 0 строк — customer_id-скоуп внутри функции работает';
    else
      raise exception 'TEST 21 FAILED: USER_B получил % строк(и) по ключу USER_A — утечка данных другого покупателя!', v_lookup_count;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 22 — orders.subtotal/discount_total/reward_discount у НОВОГО заказа
-- без промокода/награды: subtotal = total, discount_total = 0 (не NULL),
-- reward_discount = 0 (не NULL) — детерминированные "реальные нули", а не
-- legacy-неизвестность.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "REPLACE_WITH_REAL_CUSTOMER_ID", "role": "authenticated"}';

  do $$
  declare v_p1 uuid; v_subtotal numeric; v_discount numeric; v_reward_discount numeric; v_total numeric;
  begin
    select id into v_p1 from public.products where is_visible = true and is_modifier = false limit 1;
    select subtotal, discount_total, reward_discount, total
      into v_subtotal, v_discount, v_reward_discount, v_total
    from public.create_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)), null, false, 0);

    if v_discount = 0 and v_reward_discount = 0 and v_subtotal = v_total then
      raise notice 'TEST 22 OK: discount_total=0, reward_discount=0 (не NULL), subtotal=total=%', v_total;
    else
      raise exception 'TEST 22 FAILED: subtotal=%, discount_total=%, reward_discount=%, total=%', v_subtotal, v_discount, v_reward_discount, v_total;
    end if;
  end $$;
rollback;

-- ═════════════════════════════════════════════════════════════════════════
-- TEST 23 — АВТОМАТИЧЕСКИЙ post-migration тест (Block 1.6.2 дополнение):
-- реальный PRE-migration snapshot всех 14 строк public.order_items снят и
-- зафиксирован ниже как literal VALUES-baseline — значит проверку можно
-- сделать полностью автоматической, без ручного сравнения "на глаз".
--
-- Что проверяется для КАЖДОЙ из 14 known legacy id:
--   (a) строка существует (не исчезла/не удалена);
--   (b) order_id совпадает;
--   (c) product_name совпадает;
--   (d) price совпадает (включая 0.00 у id=6366a061... — это РЕАЛЬНОЕ
--       историческое значение, baseline его и ожидает, "исправлять" на
--       что-то другое НЕЛЬЗЯ);
--   (e) quantity совпадает;
--   (f) product_id IS NULL (миграция НЕ делает backfill).
-- Отдельно проверяется count(*) среди order_items с id IN (эти 14) = 14 —
-- т.е. ни одна из baseline-строк не была удалена никаким иным способом.
--
-- Тест НЕ требует, чтобы во всём order_items было ровно 14 строк — новые
-- заказы (тестовые или реальные, до/после этого прогона) добавляют новые
-- id, которые НЕ входят в baseline и этим тестом не проверяются вообще.
--
-- НИКАКИХ UPDATE/backfill здесь нет — только SELECT/сравнение. Можно
-- запускать даже без предварительного BEGIN...ROLLBACK (ничего не
-- меняется), но для единообразия с остальным runbook'ом всё равно обёрнут.
-- ═════════════════════════════════════════════════════════════════════════
begin;
  do $$
  declare
    v_baseline_count int;
    v_matched_count int;
    v_mismatch_count int;
    v_product_id_leaked_count int;
    rec record;
  begin
    create temporary table tmp_test23_baseline (
      id uuid primary key,
      order_id uuid not null,
      product_name text not null,
      price numeric(10, 2) not null,
      quantity int not null
    ) on commit drop;

    insert into tmp_test23_baseline (id, order_id, product_name, price, quantity) values
      ('0bd4399c-101c-4c56-aa93-1f509fe5ed3a', '8f650247-12b1-4a24-ab9b-5ae75d81201d', 'Айс латте', 310.00, 1),
      ('1841ee10-aa10-4997-976d-adfb896e78bb', '787148b0-971c-425a-8a0f-f07e7f1457b5', 'Тестовый капучино (grillme e2e test)', 350.00, 1),
      ('55fd00c2-b0c9-43c6-ab58-192607466f8c', '66e78c85-8fe6-4435-a6e1-f0e455cc7699', 'Айс латте', 310.00, 1),
      ('5affb5dc-9cba-46e1-b753-3ed5982834b5', '2a288251-5260-49b0-afd1-8dd998012951', 'Лимонад-расцветай', 350.00, 1),
      ('6366a061-2ed1-404e-b205-a9d7e266d0e5', '34ba8ef0-0986-4139-96a6-797ca2a06597', 'Мороженое гранат-орех', 0.00, 1),
      ('6cc514e9-bdfe-4782-897b-1aacc687d26d', '18e38f60-2eae-4cce-8f4c-82f79a69e0d7', 'Айс латте', 310.00, 1),
      ('726e43c8-bf82-4fdc-828b-4b47b61b7715', '7d1cbedc-aa2a-40db-ad37-61d940082d56', 'Гранатовый кофе', 340.00, 1),
      ('b1843795-d28e-466f-b177-67d27d438ca5', 'c117ddeb-f647-483c-a720-d5fc2fec2aa1', 'Гранатовый кофе', 340.00, 1),
      ('b9e8ac43-570d-472a-b6df-2452ba935de6', '9342e74c-b891-4d59-b7a5-4264b145c31d', 'Эспрессо-тоник на игристом', 380.00, 2),
      ('c0057421-874d-4066-97ac-6a76683f1d7c', '32a9d7df-4e00-4741-a953-b30d90f0db44', 'Айс латте', 310.00, 1),
      ('cf3e1406-9634-4e88-a887-f21168177a08', '34ba8ef0-0986-4139-96a6-797ca2a06597', 'Айс латте', 310.00, 1),
      ('d3acece7-5b17-472d-8388-1232f65c3b4c', '93892386-d43f-4ab5-992e-dd7871a19016', 'Бамбл на грейпфруте', 450.00, 1),
      ('ee242a82-026b-48d5-b5c8-0bcc98f7f4f3', '1a87d3c6-4b29-490c-9259-44fbeaced1b9', 'Пинк-дринк матча', 320.00, 1),
      ('f5e7de3f-0ccd-4d79-af99-93d0772ecfe5', '7d1cbedc-aa2a-40db-ad37-61d940082d56', 'Пинк-дринк матча', 320.00, 1);

    select count(*) into v_baseline_count from tmp_test23_baseline;
    if v_baseline_count <> 14 then
      raise exception 'TEST 23 SETUP FAILED: baseline temp table содержит % строк, ожидалось 14 (ошибка в самом тесте, не в схеме)', v_baseline_count;
    end if;

    -- (a) + count: сколько baseline-id реально нашлось в order_items.
    select count(*) into v_matched_count
    from tmp_test23_baseline b
    join public.order_items oi on oi.id = b.id;

    if v_matched_count <> 14 then
      raise exception 'TEST 23 FAILED: найдено % из 14 legacy order_items — % строк(и) отсутствуют (удалены?)', v_matched_count, 14 - v_matched_count;
    end if;

    -- (b)-(e): построчное сравнение полей + (f) product_id IS NULL.
    select count(*) into v_mismatch_count
    from tmp_test23_baseline b
    join public.order_items oi on oi.id = b.id
    where oi.order_id is distinct from b.order_id
       or oi.product_name is distinct from b.product_name
       or oi.price is distinct from b.price
       or oi.quantity is distinct from b.quantity;

    if v_mismatch_count > 0 then
      for rec in
        select oi.id, oi.order_id, oi.product_name, oi.price, oi.quantity,
               b.order_id as expected_order_id, b.product_name as expected_product_name,
               b.price as expected_price, b.quantity as expected_quantity
        from tmp_test23_baseline b
        join public.order_items oi on oi.id = b.id
        where oi.order_id is distinct from b.order_id
           or oi.product_name is distinct from b.product_name
           or oi.price is distinct from b.price
           or oi.quantity is distinct from b.quantity
      loop
        raise warning 'TEST 23 MISMATCH id=%: actual(order_id=%, name=%, price=%, qty=%) != expected(order_id=%, name=%, price=%, qty=%)',
          rec.id, rec.order_id, rec.product_name, rec.price, rec.quantity,
          rec.expected_order_id, rec.expected_product_name, rec.expected_price, rec.expected_quantity;
      end loop;
      raise exception 'TEST 23 FAILED: % из 14 legacy order_items ИЗМЕНИЛИСЬ (см. WARNING выше с точными расхождениями)', v_mismatch_count;
    end if;

    -- (f) product_id должен остаться NULL — миграция не делает backfill.
    select count(*) into v_product_id_leaked_count
    from tmp_test23_baseline b
    join public.order_items oi on oi.id = b.id
    where oi.product_id is not null;

    if v_product_id_leaked_count > 0 then
      raise exception 'TEST 23 FAILED: % из 14 legacy order_items получили НЕ-NULL product_id (ожидался NULL — backfill не должен был происходить)', v_product_id_leaked_count;
    end if;

    raise notice 'TEST 23 OK: все 14 legacy order_items найдены, ни одно поле (order_id/product_name/price/quantity) не изменилось, product_id IS NULL у всех 14 (включая price=0.00 у id=6366a061-2ed1-404e-b205-a9d7e266d0e5 — это подтверждённое историческое значение, не ошибка)';
  end $$;
rollback;
-- Примечание: этот тест НЕ проверяет общее count(*) по всему order_items —
-- новые заказы (тестовые из TEST 3-18 выше, либо реальные production
-- заказы) законно добавляют строки с NOT NULL product_id, которые не
-- входят в этот legacy baseline и намеренно этим тестом не рассматриваются.
