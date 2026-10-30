-- Run as postgres in the coffee project SQL Editor before either 20261029 migration.
-- Read-only catalog inspection. No fixture data, DDL, or migration-history assumption.
WITH
required_tables(name) AS (
  VALUES ('orders'), ('order_items'), ('products'), ('staff'),
         ('bonus_accounts'), ('bonus_transactions'),
         ('reward_progress'), ('reward_entitlements')
),
required_columns(table_name, column_name) AS (
  VALUES ('products','is_available'), ('products','is_modifier'),
         ('products','is_visible'), ('products','display_name'),
         ('products','menu_category'), ('products','sort_order'),
         ('orders','idempotency_key'), ('orders','request_fingerprint'),
         ('orders','reward_entitlement_id'), ('orders','bonus_settled_at'),
         ('orders','bonus_earned_original'), ('bonus_accounts','debt'),
         ('staff','user_id')
),
new_columns(table_name, column_name) AS (
  VALUES ('orders','customer_name'), ('orders','customer_phone'),
         ('orders','pickup_point'), ('orders','pickup_at'),
         ('orders','comment'), ('orders','payment_method'),
         ('orders','paid_at'), ('orders','manual_sale_recorded_at'),
         ('order_items','line_key'), ('order_items','base_unit_price'),
         ('order_items','modifiers'), ('order_items','preparation_note')
),
new_tables(name) AS (
  VALUES ('device_push_tokens'), ('order_notification_outbox'),
         ('order_notification_deliveries'), ('account_deletion_requests')
),
new_functions(name) AS (
  VALUES ('pickup_ordering_constants'), ('pickup_order_clock'),
         ('get_ordering_config'), ('get_ordering_catalog'),
         ('create_pickup_order'), ('update_order_status'),
         ('register_device_push_token'), ('unregister_device_push_token'),
         ('enqueue_order_notification'), ('claim_order_notifications'),
         ('record_order_notification_result'), ('renew_order_notification_lease'),
         ('finish_order_notification'), ('get_account_deletion_request'),
         ('request_account_deletion')
),
checks AS (
  SELECT '01 coffee tables exist' AS test,
    NOT EXISTS (
      SELECT 1 FROM required_tables t
      WHERE to_regclass('public.' || t.name) IS NULL
    ) AS passed
  UNION ALL
  SELECT '02 existing schema prerequisites', NOT EXISTS (
    SELECT 1 FROM required_columns r
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public'
        AND c.table_name=r.table_name AND c.column_name=r.column_name
    )
  )
  UNION ALL
  SELECT '03 current checkout exists',
    to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NOT NULL
  UNION ALL
  SELECT '04 new columns not applied yet', NOT EXISTS (
    SELECT 1 FROM new_columns r
    JOIN information_schema.columns c
      ON c.table_schema='public'
     AND c.table_name=r.table_name AND c.column_name=r.column_name
  )
  UNION ALL
  SELECT '05 new tables not applied yet', NOT EXISTS (
    SELECT 1 FROM new_tables t
    WHERE to_regclass('public.' || t.name) IS NOT NULL
  )
  UNION ALL
  SELECT '06 new functions not applied yet', NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN new_functions f ON f.name=p.proname
    WHERE n.nspname='public'
  )
  UNION ALL
  SELECT '07 notification trigger not applied yet', NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid=to_regclass('public.orders')
      AND tgname='orders_notification_outbox' AND NOT tgisinternal
  )
)
SELECT test, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY test;
