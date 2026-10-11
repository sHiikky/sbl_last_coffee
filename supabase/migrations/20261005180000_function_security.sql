BEGIN;
-- Reviewed application functions only; extension functions are not modified.
ALTER FUNCTION public.bonus_rate_for(numeric) SET search_path='';
ALTER FUNCTION public.create_order(uuid,jsonb,text,boolean,numeric,jsonb) SET search_path='';
ALTER FUNCTION public.get_order_by_idempotency_key(uuid) SET search_path='';
ALTER FUNCTION public.get_loyalty_state() SET search_path='';
ALTER FUNCTION public.rls_auto_enable() SET search_path=pg_catalog;

REVOKE ALL ON FUNCTION public.bonus_rate_for(numeric),
 public.handle_order_bonus_redeem(),public.handle_order_status_change(),
 public.bonus_order_initialize(),public.bonus_settle_insert(),
 public.reward_record_visit(uuid,date,timestamptz),public.reward_order_before(),
 public.reward_order_consume(),public.rls_auto_enable()
 FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.create_order(uuid,jsonb,text,boolean,numeric,jsonb),
 public.get_order_by_idempotency_key(uuid),public.get_loyalty_state()
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,jsonb,text,boolean,numeric,jsonb),
 public.get_order_by_idempotency_key(uuid),public.get_loyalty_state()
 TO authenticated,service_role;

-- PostgreSQL's global PUBLIC default cannot be removed by a schema-only REVOKE.
-- Future functions created by postgres must explicitly grant their API roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE EXECUTE ON FUNCTIONS FROM anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
