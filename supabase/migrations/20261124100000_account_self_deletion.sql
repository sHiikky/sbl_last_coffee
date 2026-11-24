-- Self-service account deletion from the app (App Store Review Guideline 5.1.1(v)).
-- Called ONLY by the delete-account edge function with the service role, after it has
-- identified the caller from their own session. The edge function then deletes the Auth
-- user, which cascades bonuses, loyalty progress/rewards, push settings, call attempts and
-- deletion requests (all reference auth.users ON DELETE CASCADE).
--
-- Finished orders are kept for the cafe's accounting, but without any link to the person:
-- customer_id, name, phone, comment and the request fingerprint are cleared. orders has no
-- ON DELETE action towards auth.users and its bonus/reward triggers forbid changing
-- customer_id, so the anonymization runs with the table's user triggers switched off inside
-- this one transaction (the statement touches only this customer's finished orders).
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
 IF EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = p_user) THEN
  RAISE EXCEPTION 'STAFF_ACCOUNT: staff accounts are removed by the owner' USING ERRCODE = '42501';
 END IF;
 -- Same per-customer lock as checkout and status changes: no order can start or change
 -- for this customer while the deletion runs.
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

 RETURN jsonb_build_object('anonymized_orders', anonymized);
END $$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;
COMMENT ON FUNCTION public.prepare_account_deletion(uuid) IS
 'Service role only (edge function delete-account). Refuses staff and customers with active orders; anonymizes finished orders before the Auth user is deleted.';

COMMIT;
NOTIFY pgrst, 'reload schema';
