-- Read-only: run in the coffee project after the migration.
WITH checks(test,passed) AS (
 VALUES
 ('01 promo table',to_regclass('public.app_promo_codes') IS NOT NULL),
 ('02 staff list RPC',to_regprocedure('public.staff_list_app_promos()') IS NOT NULL),
 ('03 staff save RPC',to_regprocedure('public.staff_save_app_promo(uuid,integer,jsonb)') IS NOT NULL),
 ('04 customer quote RPC',to_regprocedure('public.quote_app_promo(text,jsonb,text,numeric)') IS NOT NULL)
 UNION ALL SELECT '05 promo RLS enabled',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.app_promo_codes')),false)
 UNION ALL SELECT '06 checkout uses server promo rules',coalesce((SELECT position('app_promo_discount' in prosrc)>0 FROM pg_proc WHERE oid=to_regprocedure('public.create_pickup_order(uuid,jsonb,text,boolean,numeric,jsonb,jsonb,jsonb)')),false)
 UNION ALL SELECT '07 customer cannot enumerate codes',coalesce(NOT has_table_privilege('authenticated',to_regclass('public.app_promo_codes'),'SELECT'),false)
 UNION ALL SELECT '08 internal helper is private',coalesce(NOT has_function_privilege('authenticated',to_regprocedure('public.app_promo_discount(text,jsonb,numeric,text,numeric)'),'EXECUTE'),false)
 UNION ALL SELECT '09 staff save is not anonymous',coalesce(NOT has_function_privilege('anon',to_regprocedure('public.staff_save_app_promo(uuid,integer,jsonb)'),'EXECUTE'),false)
 UNION ALL SELECT '10 customer can quote',coalesce(has_function_privilege('authenticated',to_regprocedure('public.quote_app_promo(text,jsonb,text,numeric)'),'EXECUTE'),false)
)
SELECT test,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result FROM checks ORDER BY test;
