-- Read-only structural/permission verification AFTER both 2026-10-29 migrations.
-- One catalog SELECT; no purchases, RPC mutations, fixtures, DDL or history-table
-- assumption. Does not prove SMS/push configuration or replace functional tests.
WITH
expected_columns(table_name,column_name,type_name,not_null,has_default) AS (VALUES
 ('orders','customer_name','text',false,false),
 ('orders','customer_phone','text',false,false),
 ('orders','pickup_point','text',false,false),
 ('orders','pickup_at','timestamp with time zone',false,false),
 ('orders','comment','text',true,true),
 ('orders','payment_method','text',true,true),
 ('orders','paid_at','timestamp with time zone',false,false),
 ('orders','manual_sale_recorded_at','timestamp with time zone',false,false),
 ('order_items','line_key','text',false,false),
 ('order_items','base_unit_price','numeric(10,2)',false,false),
 ('order_items','modifiers','jsonb',true,true),
 ('order_items','preparation_note','text',true,true),
 ('device_push_tokens','id','uuid',true,true),
 ('device_push_tokens','user_id','uuid',true,false),
 ('device_push_tokens','installation_id','uuid',true,false),
 ('device_push_tokens','expo_push_token','text',true,false),
 ('device_push_tokens','platform','text',true,false),
 ('device_push_tokens','project_id','uuid',true,false),
 ('device_push_tokens','enabled','boolean',true,true),
 ('device_push_tokens','last_error_code','text',false,false),
 ('device_push_tokens','created_at','timestamp with time zone',true,true),
 ('device_push_tokens','updated_at','timestamp with time zone',true,true),
 ('order_notification_outbox','id','uuid',true,true),
 ('order_notification_outbox','order_id','uuid',true,false),
 ('order_notification_outbox','customer_id','uuid',true,false),
 ('order_notification_outbox','event_status','text',true,false),
 ('order_notification_outbox','state','text',true,true),
 ('order_notification_outbox','available_at','timestamp with time zone',true,true),
 ('order_notification_outbox','lease_id','uuid',false,false),
 ('order_notification_outbox','leased_until','timestamp with time zone',false,false),
 ('order_notification_outbox','attempts','integer',true,true),
 ('order_notification_outbox','created_at','timestamp with time zone',true,true),
 ('order_notification_outbox','updated_at','timestamp with time zone',true,true),
 ('order_notification_deliveries','id','uuid',true,true),
 ('order_notification_deliveries','outbox_id','uuid',true,false),
 ('order_notification_deliveries','device_id','uuid',false,false),
 ('order_notification_deliveries','delivered_token','text',true,false),
 ('order_notification_deliveries','state','text',true,true),
 ('order_notification_deliveries','attempts','integer',true,true),
 ('order_notification_deliveries','ticket_id','text',false,false),
 ('order_notification_deliveries','ticket_created_at','timestamp with time zone',false,false),
 ('order_notification_deliveries','next_attempt_at','timestamp with time zone',true,true),
 ('order_notification_deliveries','last_error_code','text',false,false),
 ('order_notification_deliveries','created_at','timestamp with time zone',true,true),
 ('order_notification_deliveries','updated_at','timestamp with time zone',true,true),
 ('account_deletion_requests','id','uuid',true,true),
 ('account_deletion_requests','user_id','uuid',true,false),
 ('account_deletion_requests','status','text',true,true),
 ('account_deletion_requests','public_message','text',true,true),
 ('account_deletion_requests','created_at','timestamp with time zone',true,true),
 ('account_deletion_requests','updated_at','timestamp with time zone',true,true)
),
expected_functions(signature,anon_execute,authenticated_execute,service_execute,protected_path) AS (VALUES
 ('public.pickup_ordering_constants()',false,false,false,'public,pg_temp'),
 ('public.pickup_order_clock()',false,false,false,'public,pg_temp'),
 ('public.get_ordering_config()',true,true,true,'public,pg_temp'),
 ('public.get_ordering_catalog()',true,true,true,'public,pg_temp'),
 ('public.create_pickup_order(uuid,jsonb,text,boolean,numeric,jsonb,jsonb,jsonb)',false,true,true,'public,pg_temp'),
 ('public.update_order_status(uuid,text,boolean,boolean)',false,true,true,'public,pg_temp'),
 ('public.register_device_push_token(uuid,text,text,uuid)',false,true,false,'public,pg_temp'),
 ('public.unregister_device_push_token(uuid)',false,true,false,'public,pg_temp'),
 ('public.enqueue_order_notification()',false,false,false,'public,pg_temp'),
 ('public.claim_order_notifications(uuid,integer)',false,false,true,'public,pg_temp'),
 ('public.record_order_notification_result(uuid,uuid,uuid,text,text,text)',false,false,true,'public,pg_temp'),
 ('public.renew_order_notification_lease(uuid,uuid)',false,false,true,'public,pg_temp'),
 ('public.finish_order_notification(uuid,uuid)',false,false,true,'public,pg_temp'),
 ('public.get_account_deletion_request()',false,true,false,'public,pg_temp'),
 ('public.request_account_deletion()',false,true,false,'public,pg_temp'),
 ('public.get_order_by_idempotency_key(uuid)',false,true,true,''),
 ('public.get_loyalty_state()',false,true,true,'')
),
function_state AS (
 SELECT f.*,p.oid,p.prosecdef,p.proconfig,p.proacl,p.proowner,p.prosrc
 FROM expected_functions f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature)
),
protected_tables(table_name,is_new) AS (VALUES
 ('orders',false),('order_items',false),('device_push_tokens',true),
 ('order_notification_outbox',true),('order_notification_deliveries',true),('account_deletion_requests',true)
),
table_state AS (
 SELECT t.*,c.oid,c.relrowsecurity,c.relkind FROM protected_tables t
 LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.table_name
),
api_roles(role_name) AS (VALUES('anon'),('authenticated')),
write_privileges(privilege_name) AS (VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
column_write_privileges(privilege_name) AS (VALUES('INSERT'),('UPDATE'),('REFERENCES')),
expected_triggers(trigger_name,function_signature) AS (VALUES
 ('orders_00_reward_before','public.reward_order_before()'),
 ('orders_01_bonus_initialize','public.bonus_order_initialize()'),
 ('orders_bonus_redeem_trigger','public.handle_order_bonus_redeem()'),
 ('orders_reward_consume','public.reward_order_consume()'),
 ('orders_status_bonus_trigger','public.handle_order_status_change()'),
 ('orders_z_bonus_settle_insert','public.bonus_settle_insert()'),
 ('orders_notification_outbox','public.enqueue_order_notification()')
),
expected_unique(table_name,column_names) AS (VALUES
 ('device_push_tokens',ARRAY['expo_push_token']::text[]),
 ('device_push_tokens',ARRAY['user_id','installation_id']::text[]),
 ('order_notification_outbox',ARRAY['order_id','event_status']::text[]),
 ('order_notification_deliveries',ARRAY['outbox_id','device_id']::text[]),
 ('account_deletion_requests',ARRAY['user_id']::text[])
),
checks(test,passed) AS (
 SELECT '01 API roles exist',count(*)=3 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')
 UNION ALL
 SELECT '02 all new columns, types, nullability and default presence: public.'||e.table_name,
  bool_and(coalesce(a.attnum IS NOT NULL AND format_type(a.atttypid,a.atttypmod)=e.type_name
   AND a.attnotnull=e.not_null AND a.atthasdef=e.has_default,false))
 FROM expected_columns e
 LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name
 LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
 GROUP BY e.table_name
 UNION ALL
 SELECT '03 RPC definition and privileges: '||f.signature,
  coalesce(f.oid IS NOT NULL AND f.prosecdef
   AND EXISTS(SELECT 1 FROM unnest(f.proconfig) setting WHERE
    regexp_replace(replace(setting,'"',''),'[[:space:]]','','g')='search_path='||f.protected_path)
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) acl
    WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
   AND NOT EXISTS(SELECT 1 FROM (VALUES('anon',f.anon_execute),('authenticated',f.authenticated_execute),('service_role',f.service_execute)) expected(role_name,allowed)
    LEFT JOIN pg_roles r ON r.rolname=expected.role_name
    WHERE r.oid IS NULL OR CASE WHEN f.oid IS NULL OR r.oid IS NULL THEN true
     ELSE has_function_privilege(r.oid,f.oid,'EXECUTE') IS DISTINCT FROM expected.allowed END),false)
 FROM function_state f
 UNION ALL
 SELECT '04 table and RLS: public.'||t.table_name,coalesce(t.oid IS NOT NULL AND t.relkind='r' AND t.relrowsecurity,false)
 FROM table_state t
 UNION ALL
 SELECT '05 table writes denied to API roles: public.'||t.table_name,
  t.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM api_roles a CROSS JOIN write_privileges w
   LEFT JOIN pg_roles r ON r.rolname=a.role_name
   WHERE r.oid IS NULL OR CASE WHEN t.oid IS NULL OR r.oid IS NULL THEN true
    ELSE has_table_privilege(r.oid,t.oid,w.privilege_name) END)
 FROM table_state t
 UNION ALL
 SELECT '06 column writes denied to API roles: public.'||t.table_name,
  t.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN api_roles a CROSS JOIN column_write_privileges w
   LEFT JOIN pg_roles r ON r.rolname=a.role_name
   WHERE col.attrelid=t.oid AND col.attnum>0 AND NOT col.attisdropped
    AND (r.oid IS NULL OR CASE WHEN r.oid IS NULL THEN true ELSE has_column_privilege(r.oid,t.oid,col.attnum,w.privilege_name) END))
 FROM table_state t
 UNION ALL
 SELECT '07 customer SELECT policy restricted to own UID: public.'||expected.table_name,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=expected.table_name)=1
  AND EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=expected.table_name
   AND p.policyname=expected.policy_name AND p.cmd='SELECT' AND p.roles=ARRAY['authenticated']::name[]
   AND regexp_replace(p.qual,'[[:space:]()]','','g')='user_id=auth.uid')
 FROM (VALUES('device_push_tokens','device_push_tokens_own_read'),('account_deletion_requests','account_deletion_requests_own_read')) expected(table_name,policy_name)
 UNION ALL
 SELECT '08 internal notification table not readable by API roles: public.'||t.table_name,
  t.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM api_roles a LEFT JOIN pg_roles r ON r.rolname=a.role_name
   WHERE r.oid IS NULL OR CASE WHEN t.oid IS NULL OR r.oid IS NULL THEN true ELSE has_table_privilege(r.oid,t.oid,'SELECT') END)
  AND NOT EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN api_roles a LEFT JOIN pg_roles r ON r.rolname=a.role_name
   WHERE col.attrelid=t.oid AND col.attnum>0 AND NOT col.attisdropped
    AND CASE WHEN r.oid IS NULL THEN true ELSE has_column_privilege(r.oid,t.oid,col.attnum,'SELECT') END)
 FROM table_state t WHERE t.table_name IN ('order_notification_outbox','order_notification_deliveries')
 UNION ALL
 SELECT '09 order trigger enabled and correct function: '||e.trigger_name,
  EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.orders') AND t.tgname=e.trigger_name
   AND NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND t.tgfoid=to_regprocedure(e.function_signature))
 FROM expected_triggers e
 UNION ALL
 SELECT '10 unique key: public.'||e.table_name||'('||array_to_string(e.column_names,',')||')',
  EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.'||e.table_name) AND c.contype IN ('u','p')
   AND (SELECT array_agg(a.attname::text ORDER BY key.ordinality) FROM unnest(c.conkey) WITH ORDINALITY key(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=key.attnum)=e.column_names)
 FROM expected_unique e
 UNION ALL
 SELECT '11 manual sale requires payment constraint',EXISTS(SELECT 1 FROM pg_constraint c
  WHERE c.conrelid=to_regclass('public.orders') AND c.conname='orders_manual_sale_requires_payment' AND c.contype='c' AND c.convalidated)
 UNION ALL
 SELECT '12 legacy six-argument checkout exists but API execution is closed',
  to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
   AND CASE WHEN to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NULL THEN false
    ELSE has_function_privilege(r.oid,to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)'),'EXECUTE') END)
 UNION ALL
 SELECT '13 obsolete five-argument checkout absent',to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric)') IS NULL
 UNION ALL
 SELECT '14 private pickup clock uses real time, not test fixture settings',
  EXISTS(SELECT 1 FROM function_state f WHERE f.signature='public.pickup_order_clock()'
   AND f.prosrc ~ 'clock_timestamp\(\)' AND f.prosrc !~ '(sbl\.test_now|current_setting)')
 UNION ALL
 SELECT '15 idempotency unique index remains valid',EXISTS(SELECT 1 FROM pg_index i
  WHERE i.indexrelid=to_regclass('public.orders_customer_idempotency_key_uniq') AND i.indisunique AND i.indisvalid)
),
normalized AS (SELECT test,coalesce(passed,false) AS passed FROM checks),
report AS (
 SELECT test,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result FROM normalized
 UNION ALL
 SELECT '00 OVERALL: all structural and permission checks',CASE WHEN coalesce(bool_and(passed),false) THEN 'PASS' ELSE 'FAIL' END FROM normalized
)
SELECT test,result FROM report ORDER BY test;
