-- Account deletion removes the person everywhere, not only the rows that cascade from auth.users:
-- Auth journal entries and OAuth flow state (no foreign key), refresh tokens without a session,
-- and call / code attempts made for the same phone number from other (guest) sessions.
BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 active_count integer;
 anonymized integer;
 user_phone text;
BEGIN
 IF p_user IS NULL THEN
  RAISE EXCEPTION 'USER_REQUIRED' USING ERRCODE = '22023';
 END IF;
 SELECT nullif(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), '') INTO user_phone
  FROM auth.users u WHERE u.id = p_user;
 IF NOT FOUND THEN
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

 -- Finished orders stay for the cafe's accounting, without any link to the person.
 ALTER TABLE public.orders DISABLE TRIGGER USER;
 UPDATE public.orders o
  SET customer_id = NULL, customer_name = NULL, customer_phone = NULL, comment = NULL, request_fingerprint = NULL
  WHERE o.customer_id = p_user;
 GET DIAGNOSTICS anonymized = ROW_COUNT;
 ALTER TABLE public.orders ENABLE TRIGGER USER;

 -- The phone number used by other sessions to sign in to this account.
 IF user_phone IS NOT NULL THEN
  DELETE FROM public.waitcall_auth_attempts a WHERE regexp_replace(a.phone, '\D', '', 'g') = user_phone;
  DELETE FROM public.phone_verifications v WHERE regexp_replace(v.phone, '\D', '', 'g') = user_phone;
 END IF;

 -- Auth tables without a foreign key to the user.
 DELETE FROM auth.audit_log_entries e
  WHERE e.payload->>'actor_id' = p_user::text OR e.payload->'traits'->>'user_id' = p_user::text
     OR (user_phone IS NOT NULL AND (e.payload->>'actor_username' = user_phone OR e.payload->'traits'->>'user_phone' = user_phone));
 DELETE FROM auth.flow_state f WHERE f.user_id = p_user;
 DELETE FROM auth.refresh_tokens t WHERE t.user_id = p_user::text;

 -- Cascades identities, sessions, bonus accounts and history, streak, rewards, push tokens,
 -- notifications, deletion requests and the user's own call attempts.
 DELETE FROM auth.users u WHERE u.id = p_user;

 RETURN jsonb_build_object('anonymized_orders', anonymized, 'deleted', true);
END $$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;
COMMENT ON FUNCTION public.prepare_account_deletion(uuid) IS
 'Service role only (edge function delete-account). Refuses staff and customers with active orders; anonymizes finished orders and removes the Auth user with every trace of the account.';

COMMIT;
NOTIFY pgrst, 'reload schema';
