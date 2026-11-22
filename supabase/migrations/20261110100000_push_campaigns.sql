-- Push expansion (CANDIDATE, NOT APPLIED): order status "accepted", guest consent
-- preferences, staff publication pushes and series reminders.
-- This migration sends nothing by itself: delivery needs the Edge Function,
-- Expo credentials and ORDER_PUSH_ENABLED (see work/push-campaigns/ACTIVATION.txt).
BEGIN;

-- 0. Shop hours (Asia/Tomsk, 11:00-20:00). Marketing pushes are sent only inside this window.
CREATE FUNCTION public.shop_is_open(p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXTRACT(hour FROM p_at AT TIME ZONE 'Asia/Tomsk') BETWEEN 11 AND 19
$$;
-- Earliest moment >= p_at inside the window.
CREATE FUNCTION public.shop_window_start(p_at timestamptz DEFAULT now()) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN public.shop_is_open(p_at) THEN p_at
    WHEN EXTRACT(hour FROM p_at AT TIME ZONE 'Asia/Tomsk') < 11 THEN (date_trunc('day', p_at AT TIME ZONE 'Asia/Tomsk') + interval '11 hours') AT TIME ZONE 'Asia/Tomsk'
    ELSE (date_trunc('day', p_at AT TIME ZONE 'Asia/Tomsk') + interval '1 day 11 hours') AT TIME ZONE 'Asia/Tomsk'
  END
$$;
-- Closing time (20:00) of the local day that p_at falls in.
CREATE FUNCTION public.shop_window_end(p_at timestamptz DEFAULT now()) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (date_trunc('day', p_at AT TIME ZONE 'Asia/Tomsk') + interval '20 hours') AT TIME ZONE 'Asia/Tomsk'
$$;
REVOKE ALL ON FUNCTION public.shop_is_open(timestamptz), public.shop_window_start(timestamptz), public.shop_window_end(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_is_open(timestamptz), public.shop_window_start(timestamptz), public.shop_window_end(timestamptz) TO service_role;

-- 1. Order status: add "accepted"/"preparing" to the existing outbox (ready/cancelled unchanged).
--    The kassa moves new -> preparing directly, so "preparing" is the usual "order taken" event.
ALTER TABLE public.order_notification_outbox DROP CONSTRAINT order_notification_outbox_event_status_check;
ALTER TABLE public.order_notification_outbox
  ADD CONSTRAINT order_notification_outbox_event_status_check CHECK (event_status IN ('accepted', 'preparing', 'ready', 'cancelled'));

CREATE OR REPLACE FUNCTION public.enqueue_order_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- An order today makes a queued "continue your series" reminder pointless.
  IF NEW.customer_id IS NOT NULL AND NEW.status::text <> 'cancelled' THEN
    UPDATE public.marketing_push_queue SET state = 'disabled', last_error_code = 'ORDER_PLACED', lease_id = NULL, leased_until = NULL, updated_at = now()
      WHERE user_id = NEW.customer_id AND kind = 'series_reminder' AND state IN ('pending', 'retry', 'processing');
  END IF;
  IF NEW.customer_id IS NULL OR NEW.status NOT IN ('accepted', 'preparing', 'ready', 'cancelled') THEN RETURN NEW; END IF;
  -- A stale "accepted" must not arrive after "ready"/"cancelled", nor "ready" after cancellation.
  UPDATE public.order_notification_outbox SET state = 'superseded', lease_id = NULL, leased_until = NULL, updated_at = now()
    WHERE order_id = NEW.id AND event_status <> NEW.status::text AND state IN ('pending', 'processing', 'awaiting_receipts');
  -- A status that comes back after being superseded is notified again: its old per-device
  -- delivery rows are dropped so claim_order_notifications creates fresh ones.
  DELETE FROM public.order_notification_deliveries d USING public.order_notification_outbox n
    WHERE d.outbox_id = n.id AND n.order_id = NEW.id AND n.event_status = NEW.status::text AND n.state = 'superseded';
  INSERT INTO public.order_notification_outbox(order_id, customer_id, event_status)
    VALUES (NEW.id, NEW.customer_id, NEW.status::text)
    ON CONFLICT (order_id, event_status) DO UPDATE SET state = 'pending', attempts = 0, available_at = now(), lease_id = NULL, leased_until = NULL, updated_at = now()
      WHERE public.order_notification_outbox.state = 'superseded';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_order_notification() FROM PUBLIC, anon, authenticated, service_role;

-- 2. Consent. Order-status pushes are transactional and need only the device opt-in.
--    Promotions and series reminders are OFF until the guest turns them on.
CREATE TABLE public.push_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  promotions boolean NOT NULL DEFAULT false,
  series_reminders boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_preferences FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_preferences TO service_role;

CREATE FUNCTION public.get_push_preferences() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.push_preferences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.push_preferences WHERE user_id = auth.uid();
  RETURN jsonb_build_object('promotions', coalesce(v.promotions, false), 'series_reminders', coalesce(v.series_reminders, false));
END $$;

CREATE FUNCTION public.set_push_preferences(p_promotions boolean, p_series_reminders boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_promotions IS NULL OR p_series_reminders IS NULL THEN RAISE EXCEPTION 'INVALID_PUSH_PREFERENCES' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.push_preferences(user_id, promotions, series_reminders) VALUES (auth.uid(), p_promotions, p_series_reminders)
    ON CONFLICT (user_id) DO UPDATE SET promotions = EXCLUDED.promotions, series_reminders = EXCLUDED.series_reminders, updated_at = now();
  -- Withdrawn consent also cancels anything already queued.
  UPDATE public.marketing_push_queue SET state = 'disabled', last_error_code = 'CONSENT_WITHDRAWN', lease_id = NULL, leased_until = NULL, updated_at = now()
    WHERE user_id = auth.uid() AND state IN ('pending', 'retry', 'processing')
      AND ((kind = 'publication' AND NOT p_promotions) OR (kind = 'series_reminder' AND NOT p_series_reminders));
  RETURN jsonb_build_object('promotions', p_promotions, 'series_reminders', p_series_reminders);
END $$;
REVOKE ALL ON FUNCTION public.get_push_preferences(), public.set_push_preferences(boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_push_preferences(), public.set_push_preferences(boolean, boolean) TO authenticated;

-- 3. One row per device for publication pushes and series reminders.
CREATE TABLE public.marketing_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('publication', 'series_reminder')),
  dedupe_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.device_push_tokens(id) ON DELETE CASCADE,
  token text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 240),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'retry', 'ticketed', 'delivered', 'disabled', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_id uuid,
  leased_until timestamptz,
  ticket_id text,
  ticket_created_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key, device_id)
);
CREATE INDEX marketing_push_queue_due ON public.marketing_push_queue(next_attempt_at, id) WHERE state IN ('pending', 'retry', 'ticketed', 'processing');
CREATE INDEX marketing_push_queue_finished ON public.marketing_push_queue(updated_at) WHERE state IN ('delivered', 'disabled', 'failed');
CREATE INDEX marketing_push_queue_user ON public.marketing_push_queue(user_id, kind) WHERE state IN ('pending', 'retry', 'processing');
ALTER TABLE public.marketing_push_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_push_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_push_queue TO service_role;

-- A publication can be pushed once; the second attempt is refused, not duplicated.
CREATE TABLE public.publication_push_sends (
  publication_id uuid PRIMARY KEY REFERENCES public.app_publications(id) ON DELETE CASCADE,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  deliver_from timestamptz NOT NULL DEFAULT now(),
  recipients integer NOT NULL CHECK (recipients >= 0)
);
ALTER TABLE public.publication_push_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_push_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.publication_push_sends TO service_role;

-- 4. Cashier action: queue a push for a live published item to everyone who agreed.
--    Delivery happens only 11:00-20:00 Tomsk: outside it the push waits for the next opening.
--    One push per publication (re-sendable only if nothing was queued or every row ended undelivered);
--    at most 2 per 24 h and 1 per hour across all publications, counted by DELIVERY time
--    (pushes queued after closing all start at 11:00 and must not arrive together).
CREATE FUNCTION public.staff_send_publication_push(p_publication_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pub public.app_publications%ROWTYPE; v_count integer; v_title text; v_body text; v_start timestamptz; v_exp timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('publication-push:' || p_publication_id::text, 0));
  SELECT * INTO v_pub FROM public.app_publications WHERE id = p_publication_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLICATION_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_pub.status <> 'published' OR v_pub.starts_at > now() OR (v_pub.ends_at IS NOT NULL AND v_pub.ends_at <= now()) THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_ACTIVE' USING ERRCODE = '22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.publication_push_sends WHERE publication_id = p_publication_id) THEN
    IF EXISTS(SELECT 1 FROM public.marketing_push_queue WHERE dedupe_key = 'publication:' || v_pub.id::text
                AND state IN ('pending', 'retry', 'processing', 'ticketed', 'delivered')) THEN
      RAISE EXCEPTION 'PUBLICATION_PUSH_ALREADY_SENT' USING ERRCODE = '22023'; END IF;
    DELETE FROM public.publication_push_sends WHERE publication_id = p_publication_id; -- nothing reached anyone: allow again
  END IF;
  v_start := public.shop_window_start(now());
  -- Serialize concurrent sends of different publications so the limit cannot be raced.
  PERFORM pg_advisory_xact_lock(hashtextextended('publication-push:rate', 0));
  IF EXISTS(SELECT 1 FROM public.publication_push_sends WHERE deliver_from > v_start - interval '1 hour' AND deliver_from < v_start + interval '1 hour')
     OR (SELECT count(*) FROM public.publication_push_sends WHERE deliver_from > v_start - interval '24 hours' AND deliver_from < v_start + interval '24 hours') >= 2 THEN
    RAISE EXCEPTION 'PUSH_RATE_LIMIT' USING ERRCODE = '22023'; END IF;
  v_exp := least(public.shop_window_end(v_start), coalesce(v_pub.ends_at, 'infinity'::timestamptz));
  IF v_exp <= v_start THEN RAISE EXCEPTION 'PUBLICATION_ENDS_BEFORE_OPENING' USING ERRCODE = '22023'; END IF;
  v_title := CASE WHEN v_pub.kind = 'promotion' THEN 'Акция SBL' ELSE 'Новости SBL' END;
  v_body := left(regexp_replace(v_pub.title, '\s+', ' ', 'g'), 240);
  -- The "promotions" consent covers both promotions and news.
  INSERT INTO public.marketing_push_queue(kind, dedupe_key, user_id, device_id, token, title, body, data, next_attempt_at, expires_at)
    SELECT 'publication', 'publication:' || v_pub.id::text, t.user_id, t.id, t.expo_push_token, v_title, v_body,
           jsonb_build_object('type', 'publication', 'userId', t.user_id, 'publicationId', v_pub.id), v_start, v_exp
      FROM public.device_push_tokens t JOIN public.push_preferences p ON p.user_id = t.user_id AND p.promotions
      WHERE t.enabled
    ON CONFLICT (dedupe_key, device_id) DO UPDATE SET state = 'pending', attempts = 0, lease_id = NULL, leased_until = NULL, ticket_id = NULL,
        ticket_created_at = NULL, last_error_code = NULL, token = EXCLUDED.token, next_attempt_at = EXCLUDED.next_attempt_at,
        expires_at = EXCLUDED.expires_at, updated_at = now()
      WHERE public.marketing_push_queue.state IN ('disabled', 'failed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    INSERT INTO public.publication_push_sends(publication_id, sent_by, deliver_from, recipients) VALUES (v_pub.id, auth.uid(), v_start, v_count);
  END IF;
  RETURN jsonb_build_object('queued', v_count, 'deliver_from', v_start, 'deliver_until', v_exp);
END $$;
REVOKE ALL ON FUNCTION public.staff_send_publication_push(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_send_publication_push(uuid) TO authenticated;

-- 5. Series reminder: streak is alive (last visit yesterday, Asia/Tomsk), nothing today yet.
--    One per guest per day, only 15:00-18:59 Tomsk; expires at closing (20:00); skipped if the guest already ordered today.
CREATE FUNCTION public.enqueue_series_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_local timestamp := now() AT TIME ZONE 'Asia/Tomsk'; v_today date := (now() AT TIME ZONE 'Asia/Tomsk')::date; v_count integer;
BEGIN
  IF EXTRACT(hour FROM v_local) NOT BETWEEN 15 AND 18 THEN RETURN 0; END IF;
  INSERT INTO public.marketing_push_queue(kind, dedupe_key, user_id, device_id, token, title, body, data, expires_at)
    SELECT 'series_reminder', 'series:' || r.customer_id::text || ':' || v_today::text, t.user_id, t.id, t.expo_push_token,
           'Серия SBL',
           CASE WHEN (r.current_streak + 1) % 10 = 0 THEN 'Заказ сегодня откроет десерт в подарок. Ждём до 20:00!'
                ELSE 'Ваша серия — ' || r.current_streak || ' дн. Загляните сегодня до 20:00, чтобы продолжить.' END,
           jsonb_build_object('type', 'series_reminder', 'userId', t.user_id),
           least(now() + interval '3 hours', public.shop_window_end(now()))
      FROM public.reward_progress r
      JOIN public.push_preferences p ON p.user_id = r.customer_id AND p.series_reminders
      JOIN public.device_push_tokens t ON t.user_id = r.customer_id AND t.enabled
      WHERE r.current_streak >= 1 AND r.last_qualified_day = v_today - 1
        AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id = r.customer_id AND o.status::text <> 'cancelled'
                       AND (o.created_at AT TIME ZONE 'Asia/Tomsk')::date = v_today)
    ON CONFLICT (dedupe_key, device_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_series_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_series_reminders() TO service_role;

-- 6. Worker RPCs (service_role only). Consent, device and expiry are re-checked at claim time.
CREATE FUNCTION public.claim_marketing_pushes(p_limit integer DEFAULT 50) RETURNS SETOF jsonb
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
      OR NOT EXISTS(SELECT 1 FROM public.push_preferences p WHERE p.user_id = q.user_id AND CASE q.kind WHEN 'publication' THEN p.promotions ELSE p.series_reminders END)
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

CREATE FUNCTION public.record_marketing_push_result(p_id uuid, p_lease_id uuid, p_state text, p_ticket_id text DEFAULT NULL, p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.marketing_push_queue%ROWTYPE;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('retry', 'ticketed', 'delivered', 'disabled', 'failed') THEN RAISE EXCEPTION 'INVALID_DELIVERY_STATE'; END IF;
  SELECT * INTO v FROM public.marketing_push_queue WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.lease_id IS DISTINCT FROM p_lease_id OR v.leased_until <= now() OR v.state NOT IN ('processing', 'ticketed') THEN RETURN false; END IF;
  IF p_state = 'ticketed' AND (p_ticket_id IS NULL OR length(p_ticket_id) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'INVALID_PUSH_TICKET'; END IF;
  UPDATE public.marketing_push_queue SET
      state = CASE WHEN p_state = 'retry' AND attempts >= 5 THEN 'failed' ELSE p_state END,
      ticket_id = CASE WHEN p_state = 'ticketed' THEN p_ticket_id ELSE ticket_id END,
      ticket_created_at = CASE WHEN p_state = 'ticketed' AND ticket_id IS DISTINCT FROM p_ticket_id THEN now() ELSE ticket_created_at END,
      next_attempt_at = CASE WHEN p_state = 'ticketed' THEN now() + interval '15 minutes'
        WHEN p_state = 'retry' THEN now() + least(1800, (power(2, greatest(attempts, 1)) * 15)::integer) * interval '1 second' ELSE next_attempt_at END,
      lease_id = NULL, leased_until = NULL, last_error_code = left(p_error_code, 100), updated_at = now()
    WHERE id = p_id;
  IF p_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.device_push_tokens SET enabled = false, last_error_code = 'DeviceNotRegistered', updated_at = now()
      WHERE id = v.device_id AND user_id = v.user_id AND expo_push_token = v.token;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_marketing_pushes(integer), public.record_marketing_push_result(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketing_pushes(integer), public.record_marketing_push_result(uuid, uuid, text, text, text) TO service_role;

COMMENT ON TABLE public.marketing_push_queue IS 'Publication/series pushes, one row per device. Requires explicit guest consent in push_preferences; re-checked at claim time.';
NOTIFY pgrst,'reload schema';
COMMIT;
