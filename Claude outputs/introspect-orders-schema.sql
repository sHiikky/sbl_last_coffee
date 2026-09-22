-- introspect-orders-schema.sql
--
-- READ-ONLY. Ничего не меняет и не создаёт — только показывает реальное
-- текущее состояние базы. Нужен перед применением
-- 20260911120000_atomic_order_creation.sql, чтобы миграцию можно было
-- скорректировать под реальные типы/constraints, а не под предположения.
--
-- Запускать целиком в Supabase Dashboard -> SQL Editor. Каждый блок — вывод,
-- их 10 штук по порядку из задания (Block 1.1, п.1). Пришли мне результат
-- (можно скриншотами таблиц или CSV-экспортом каждого запроса) — я подставлю
-- реальные значения в миграцию вместо предположений.

-- 1) columns + типы + nullable/default: public.orders
select column_name, data_type, udt_name, is_nullable, column_default,
       character_maximum_length, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
order by ordinal_position;

-- 2) columns + типы + nullable/default: public.order_items
select column_name, data_type, udt_name, is_nullable, column_default,
       character_maximum_length, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'order_items'
order by ordinal_position;

-- 3) columns + типы: public.products
select column_name, data_type, udt_name, is_nullable, column_default,
       character_maximum_length, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'products'
order by ordinal_position;

-- 4) constraints: orders + order_items (PK/FK/UNIQUE/CHECK)
select tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name, ccu.table_name as references_table, ccu.column_name as references_column,
       chk.check_clause
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  and tc.constraint_type = 'FOREIGN KEY'
left join information_schema.check_constraints chk
  on chk.constraint_name = tc.constraint_name and chk.constraint_schema = tc.table_schema
where tc.table_schema = 'public' and tc.table_name in ('orders', 'order_items')
order by tc.table_name, tc.constraint_type, tc.constraint_name;

-- 5) indexes: orders + order_items (включая уникальные/частичные — важно для ON CONFLICT)
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('orders', 'order_items')
order by tablename, indexname;

-- 6) triggers: orders + order_items
select event_object_table as table_name, trigger_name, action_timing, event_manipulation,
       action_statement, action_orientation
from information_schema.triggers
where event_object_schema = 'public' and event_object_table in ('orders', 'order_items')
order by event_object_table, trigger_name;

-- 7) полные определения trigger-функций, связанных с bonus/reward/order
-- (найдёт handle_order_bonus_redeem, handle_order_status_change и любые
-- другие похожие по имени — если названы иначе, смотри список в п.6 выше и
-- подставь реальные имена сюда).
select p.proname as function_name, pg_get_functiondef(p.oid) as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%order%'
    or p.proname ilike '%bonus%'
    or p.proname ilike '%reward%'
    or p.proname ilike '%loyalty%'
  );

-- 8) уже существующие функции с именем create_order (проверить, не
-- перезапишет ли миграция что-то с другой сигнатурой/поведением)
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as is_security_definer, p.proacl as access_privileges,
       pg_get_functiondef(p.oid) as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_order';

-- 9) RLS policies: orders + order_items
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('orders', 'order_items')
order by tablename, policyname;

-- 9b) сам факт включённости RLS на этих таблицах (bool)
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('orders', 'order_items', 'products', 'bonus_accounts')
  and relnamespace = 'public'::regnamespace;

-- 10) на всякий случай: есть ли уже колонка вроде "idempotency_key" или
-- "request_fingerprint" под другим именем — чтобы не задвоить смысл.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%idempot%' or column_name ilike '%fingerprint%' or column_name ilike '%request_key%');
