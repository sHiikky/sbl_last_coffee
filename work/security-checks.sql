DO $$
DECLARE f record; role_name text; api boolean;
BEGIN
 FOR f IN SELECT p.oid,p.proname,p.proconfig,p.prosecdef,p.proacl,p.proowner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND NOT EXISTS(
   SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
 LOOP
  api:=f.proname IN ('create_order','get_order_by_idempotency_key','get_loyalty_state','set_product_availability');
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))
   WHERE grantee=0 AND privilege_type='EXECUTE') THEN
   RAISE EXCEPTION 'TEST_FAILED: PUBLIC execute on %',f.oid::regprocedure;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(role_name,f.oid,'EXECUTE') IS DISTINCT FROM
      (api AND role_name<>'anon' AND NOT (f.proname='set_product_availability' AND role_name='service_role')) THEN
    RAISE EXCEPTION 'TEST_FAILED: unexpected % privilege on %',role_name,f.oid::regprocedure;
   END IF;
  END LOOP;
  IF f.prosecdef AND NOT (coalesce(f.proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""']
    OR (f.proname='rls_auto_enable' AND f.proconfig @> ARRAY['search_path=pg_catalog'])) THEN
   RAISE EXCEPTION 'TEST_FAILED: unsafe search_path on %',f.oid::regprocedure;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS: application function inventory, API allowlist, internal grants, definer search paths';
END $$;

CREATE FUNCTION public.security_default_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
DO $$ BEGIN
 IF has_function_privilege('anon','public.security_default_probe()','EXECUTE')
 OR has_function_privilege('authenticated','public.security_default_probe()','EXECUTE')
 OR has_function_privilege('service_role','public.security_default_probe()','EXECUTE') THEN
  RAISE EXCEPTION 'TEST_FAILED: future function default execute';
 END IF;
END $$;
DROP FUNCTION public.security_default_probe();

-- Verify owner filtering under the actual client role and a shadow table.
DO $$
DECLARE u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); k uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(other_user);
 INSERT INTO public.orders(customer_id,total,status,idempotency_key) VALUES(other_user,10,'new',k);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('security.test_key',k::text,true);
END $$;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE orders(id uuid);
SET LOCAL search_path=pg_temp,public;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.get_order_by_idempotency_key(current_setting('security.test_key')::uuid)) THEN
  RAISE EXCEPTION 'TEST_FAILED: foreign order exposed';
 END IF;
 PERFORM public.get_loyalty_state();
 BEGIN
  PERFORM public.reward_record_visit(auth.uid(),current_date,now());
  RAISE EXCEPTION 'TEST_FAILED: client invoked internal reward helper';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: authenticated API access, foreign-order isolation, shadow-table safety, blocked internal calls, future defaults';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.get_loyalty_state();
  RAISE EXCEPTION 'TEST_FAILED: anon accessed loyalty API';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM * FROM public.get_order_by_idempotency_key(gen_random_uuid());
  RAISE EXCEPTION 'TEST_FAILED: anon accessed order API';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: anonymous RPC calls denied';
END $$;
RESET ROLE;
ROLLBACK;
