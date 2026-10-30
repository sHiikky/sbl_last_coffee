WITH functions(signature,allow_anon) AS (VALUES
 ('public.get_app_publications()',true),
 ('public.staff_list_app_publications()',false),
 ('public.staff_save_app_publication(uuid,integer,jsonb)',false)
), checks(test,passed) AS (
 SELECT '01 publication table and RLS',EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.app_publications') AND relrowsecurity)
 UNION ALL
 SELECT '02 API roles cannot read/write underlying table',NOT EXISTS(
  SELECT 1 FROM pg_roles r CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
  WHERE r.rolname IN ('anon','authenticated') AND CASE WHEN to_regclass('public.app_publications') IS NULL THEN true
   ELSE has_table_privilege(r.oid,to_regclass('public.app_publications'),p.privilege) END)
 UNION ALL
 SELECT '03 protected RPC: '||f.signature,EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND p.prosecdef
  AND EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE regexp_replace(c,'[[:space:]]','','g')='search_path=public,pg_temp')
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
  AND has_function_privilege('anon',p.oid,'EXECUTE')=f.allow_anon
  AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND has_function_privilege('service_role',p.oid,'EXECUTE')) FROM functions f
 UNION ALL
 SELECT '04 published index valid',EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.app_publications_published') AND indisvalid)
 UNION ALL
 SELECT '05 no direct customer policies',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_publications')
)
SELECT test,CASE WHEN coalesce(passed,false) THEN 'PASS' ELSE 'FAIL' END AS result FROM checks ORDER BY test;
