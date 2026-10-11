-- Read-only verification, one result for SQL Editor. No test purchases.
SELECT jsonb_build_object(
 'migration_versions',(SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
 'availability_column',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='is_available'),
 'quoted_checkout',to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NOT NULL,
 'old_checkout_removed',to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric)') IS NULL,
 'historical_completed_orders',(SELECT count(*) FROM public.orders WHERE status='completed' AND created_at<'2026-10-05'::timestamptz),
 'historical_unaccounted_cash_snapshots',(SELECT count(*) FROM public.orders o WHERE o.status='completed'
  AND o.created_at<'2026-10-05'::timestamptz AND o.bonus_settled_at IS NOT NULL AND o.bonus_cash_paid=0 AND o.bonus_earned_original=0),
 'function_access',(SELECT jsonb_agg(jsonb_build_object('function',p.oid::regprocedure::text,'configuration',p.proconfig,
  'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(
   SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'))
) AS postdeploy_report;
