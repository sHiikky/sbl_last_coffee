BEGIN;

ALTER TABLE public.push_preferences
  ADD COLUMN return_reminders boolean NOT NULL DEFAULT false,
  ADD COLUMN return_reminder_order_id uuid;

ALTER TABLE public.marketing_push_queue
  DROP CONSTRAINT marketing_push_queue_kind_check,
  ADD CONSTRAINT marketing_push_queue_kind_check
    CHECK (kind IN ('publication', 'series_reminder', 'return_reminder'));

CREATE OR REPLACE FUNCTION public.get_push_preferences() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.push_preferences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.push_preferences WHERE user_id = auth.uid();
  RETURN jsonb_build_object('promotions', coalesce(v.promotions, false), 'series_reminders', coalesce(v.series_reminders, false),
    'return_reminders', coalesce(v.return_reminders, false));
END $$;

CREATE FUNCTION public.set_return_reminders(p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'INVALID_PUSH_PREFERENCES' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.push_preferences(user_id, return_reminders)
    VALUES (v_user_id, p_enabled)
    ON CONFLICT (user_id) DO UPDATE SET return_reminders = EXCLUDED.return_reminders, updated_at = now();
  IF NOT p_enabled THEN
    UPDATE public.marketing_push_queue
      SET state = 'disabled', last_error_code = 'CONSENT_WITHDRAWN', lease_id = NULL, leased_until = NULL, updated_at = now()
      WHERE user_id = v_user_id AND kind = 'return_reminder' AND state IN ('pending', 'retry', 'processing');
  END IF;
  RETURN p_enabled;
END $$;
REVOKE ALL ON FUNCTION public.set_return_reminders(boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_return_reminders(boolean) TO authenticated;

CREATE FUNCTION public.return_reminder_has_recent_order(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE customer_id = p_user_id
      AND (status IN ('new', 'accepted', 'preparing', 'ready')
        OR (status = 'completed' AND paid_at > now() - interval '7 days'))
  )
$$;
REVOKE ALL ON FUNCTION public.return_reminder_has_recent_order(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.enqueue_return_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.shop_is_open(now()) THEN RETURN 0; END IF;

  -- Lock the consent row before enqueueing so parallel runs and preference changes serialize.
  WITH eligible AS (
    SELECT p.user_id, last_order.id AS order_id, device.id AS device_id, device.expo_push_token
    FROM public.push_preferences p
    JOIN LATERAL (
      SELECT o.id
      FROM public.orders o
      WHERE o.customer_id = p.user_id AND o.status = 'completed' AND o.paid_at IS NOT NULL
      ORDER BY o.paid_at DESC, o.id DESC LIMIT 1
    ) last_order ON true
    JOIN LATERAL (
      SELECT t.id, t.expo_push_token
      FROM public.device_push_tokens t
      WHERE t.user_id = p.user_id AND t.enabled
      ORDER BY t.updated_at DESC, t.id DESC LIMIT 1
    ) device ON true
    WHERE p.return_reminders
      AND p.return_reminder_order_id IS DISTINCT FROM last_order.id
      AND NOT public.return_reminder_has_recent_order(p.user_id)
    FOR UPDATE OF p SKIP LOCKED
  ), queued AS (
    INSERT INTO public.marketing_push_queue(kind, dedupe_key, user_id, device_id, token, title, body, data, expires_at)
      SELECT 'return_reminder', 'return:' || order_id::text, user_id, device_id, expo_push_token,
        'Давно не виделись ☕', 'Загляните за любимым кофе',
        jsonb_build_object('type', 'return_reminder', 'userId', user_id),
        public.shop_window_end(now())
      FROM eligible
      ON CONFLICT (dedupe_key, device_id) DO NOTHING
      RETURNING user_id
  )
  UPDATE public.push_preferences p SET return_reminder_order_id = eligible.order_id
    FROM eligible JOIN queued USING (user_id) WHERE p.user_id = eligible.user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_return_reminders() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_return_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_marketing_pushes(p_limit integer DEFAULT 50) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_lease uuid := gen_random_uuid(); v_open boolean;
BEGIN
  -- Housekeeping: forget old finished rows.
  DELETE FROM public.marketing_push_queue WHERE state IN ('delivered', 'disabled', 'failed') AND updated_at < now() - interval '30 days';
  -- Rows that exhausted their attempts (including crash loops in 'processing') are failed, never re-sent.
  UPDATE public.marketing_push_queue SET state = 'failed', last_error_code = 'RETRY_LIMIT', lease_id = NULL, leased_until = NULL, updated_at = now()
    WHERE attempts >= 5 AND (state IN ('pending', 'retry') OR (state = 'processing' AND leased_until < now()));
  -- Drop what no longer has a valid recipient, consent, lifetime or reason (also rows with a lapsed lease).
  UPDATE public.marketing_push_queue q SET state = 'disabled', last_error_code =
      CASE WHEN q.expires_at <= now() THEN 'EXPIRED'
           WHEN q.kind = 'series_reminder' AND EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id = q.user_id AND o.status::text <> 'cancelled'
                  AND (o.created_at AT TIME ZONE 'Asia/Tomsk')::date = (now() AT TIME ZONE 'Asia/Tomsk')::date) THEN 'ORDER_PLACED'
           ELSE 'OPTED_OUT_OR_ACCOUNT_CHANGED' END, lease_id = NULL, leased_until = NULL, updated_at = now()
    WHERE ((q.state IN ('pending', 'retry') AND q.next_attempt_at <= now()) OR (q.state = 'processing' AND q.leased_until < now())) AND (
      q.expires_at <= now()
      OR NOT EXISTS(SELECT 1 FROM public.device_push_tokens t WHERE t.id = q.device_id AND t.user_id = q.user_id AND t.enabled AND t.expo_push_token = q.token)
      OR NOT EXISTS(SELECT 1 FROM public.push_preferences p WHERE p.user_id = q.user_id AND CASE q.kind WHEN 'publication' THEN p.promotions WHEN 'series_reminder' THEN p.series_reminders ELSE p.return_reminders END)
      OR (q.kind = 'return_reminder' AND public.return_reminder_has_recent_order(q.user_id))
      OR (q.kind = 'series_reminder' AND EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id = q.user_id AND o.status::text <> 'cancelled'
            AND (o.created_at AT TIME ZONE 'Asia/Tomsk')::date = (now() AT TIME ZONE 'Asia/Tomsk')::date)));
  -- Outside 11:00-20:00 Tomsk nothing new is sent; only receipt checks of already ticketed rows go on.
  v_open := public.shop_is_open(now());
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.marketing_push_queue
      WHERE (v_open AND state IN ('pending', 'retry') AND next_attempt_at <= now())
         OR (state = 'ticketed' AND next_attempt_at <= now() AND (leased_until IS NULL OR leased_until < now()))
         OR (v_open AND state = 'processing' AND leased_until < now() AND attempts < 5)
      ORDER BY next_attempt_at, id LIMIT greatest(1, least(coalesce(p_limit, 50), 100)) FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.marketing_push_queue q SET
        lease_id = v_lease, leased_until = now() + interval '120 seconds', updated_at = now(),
        attempts = CASE WHEN q.state = 'ticketed' THEN q.attempts ELSE q.attempts + 1 END,
        state = CASE WHEN q.state = 'ticketed' THEN 'ticketed' ELSE 'processing' END
      FROM picked WHERE q.id = picked.id
      RETURNING q.*
  )
  SELECT jsonb_build_object('id', id, 'lease_id', lease_id, 'kind', kind, 'user_id', user_id, 'token', token, 'title', title,
    'body', body, 'data', data, 'state', state, 'attempts', attempts, 'ticket_id', ticket_id, 'ticket_created_at', ticket_created_at) FROM upd;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
