-- The VPS gateway does not expose the Auth admin API, so the Auth user is deleted here, in the
-- same transaction as the anonymization. auth.users cascades identities, sessions, refresh
-- tokens and every public table that references the user with ON DELETE CASCADE.
BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 active_count integer;
 anonymized integer;
BEGIN
 IF p_user IS NULL THEN
  RAISE EXCEPTION 'USER_REQUIRED' USING ERRCODE = '22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user) THEN
  RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = '22023';
 END IF;
 IF EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = p_user) THEN
  RAISE EXCEPTION 'STAFF_ACCOUNT: staff accounts are removed by the owner' USING ERRCODE = '42501';
 END IF;
 INSERT INTO public.reward_progress(customer_id) VALUES (p_user) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.reward_progress r WHERE r.customer_id = p_user FOR UPDATE;
 SELECT count(*) INTO active_count FROM public.orders o
  WHERE o.customer_id = p_user AND o.status::text IN ('new', 'accepted', 'preparing', 'ready');
 IF active_count > 0 THEN
  RAISE EXCEPTION 'ACTIVE_ORDERS: %', active_count USING ERRCODE = '22023';
 END IF;

 ALTER TABLE public.orders DISABLE TRIGGER USER;
 UPDATE public.orders o
  SET customer_id = NULL, customer_name = NULL, customer_phone = NULL, comment = NULL, request_fingerprint = NULL
  WHERE o.customer_id = p_user;
 GET DIAGNOSTICS anonymized = ROW_COUNT;
 ALTER TABLE public.orders ENABLE TRIGGER USER;

 DELETE FROM auth.users u WHERE u.id = p_user;

 RETURN jsonb_build_object('anonymized_orders', anonymized, 'deleted', true);
END $$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;
COMMENT ON FUNCTION public.prepare_account_deletion(uuid) IS
 'Service role only (edge function delete-account). Refuses staff and customers with active orders; anonymizes finished orders and deletes the Auth user.';

COMMIT;
NOTIFY pgrst, 'reload schema';
