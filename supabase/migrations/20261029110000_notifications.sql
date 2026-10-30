-- Device-specific opt-in, order-status outbox and manual deletion requests.
-- No HTTP calls, SMS or push messages are sent by this migration.
BEGIN;

CREATE TABLE public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  expo_push_token text NOT NULL UNIQUE CHECK (expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  project_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, installation_id)
);
ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_push_tokens_own_read ON public.device_push_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.device_push_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.device_push_tokens TO authenticated;
GRANT ALL ON public.device_push_tokens TO service_role;

CREATE TABLE public.order_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_status text NOT NULL CHECK (event_status IN ('ready', 'cancelled')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'awaiting_receipts', 'sent', 'no_devices', 'failed', 'superseded')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  leased_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_status)
);
CREATE INDEX order_notification_outbox_due ON public.order_notification_outbox(available_at) WHERE state IN ('pending', 'processing', 'awaiting_receipts');
ALTER TABLE public.order_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_notification_outbox TO service_role;

CREATE TABLE public.order_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.order_notification_outbox(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.device_push_tokens(id) ON DELETE SET NULL,
  delivered_token text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'retry', 'ticketed', 'delivered', 'disabled', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ticket_id text,
  ticket_created_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outbox_id, device_id)
);
ALTER TABLE public.order_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.register_device_push_token(p_installation_id uuid, p_expo_push_token text, p_platform text, p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_existing public.device_push_tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_installation_id IS NULL OR p_project_id IS NULL OR p_platform IS NULL OR p_platform NOT IN ('android', 'ios')
     OR p_expo_push_token IS NULL OR p_expo_push_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'
  THEN RAISE EXCEPTION 'INVALID_PUSH_REGISTRATION' USING ERRCODE = '22023'; END IF;
  -- Serialize registrations for one account, including its ten-device cap.
  PERFORM pg_advisory_xact_lock(hashtextextended('push-user:' || v_uid::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('push-token:' || p_expo_push_token, 0));
  SELECT * INTO v_existing FROM public.device_push_tokens WHERE expo_push_token = p_expo_push_token FOR UPDATE;
  IF FOUND AND v_existing.user_id <> v_uid AND v_existing.installation_id <> p_installation_id
  THEN RAISE EXCEPTION 'PUSH_TOKEN_OWNERSHIP_MISMATCH' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.device_push_tokens WHERE user_id = v_uid AND enabled AND installation_id <> p_installation_id AND expo_push_token <> p_expo_push_token) >= 10
  THEN RAISE EXCEPTION 'DEVICE_LIMIT_REACHED' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.device_push_tokens WHERE user_id = v_uid AND installation_id = p_installation_id AND expo_push_token <> p_expo_push_token;
  INSERT INTO public.device_push_tokens(user_id, installation_id, expo_push_token, platform, project_id)
  VALUES (v_uid, p_installation_id, p_expo_push_token, p_platform, p_project_id)
  ON CONFLICT (expo_push_token) DO UPDATE SET user_id = v_uid, installation_id = EXCLUDED.installation_id,
    platform = EXCLUDED.platform, project_id = EXCLUDED.project_id, enabled = true, last_error_code = NULL, updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'enabled', true);
END $$;

CREATE OR REPLACE FUNCTION public.unregister_device_push_token(p_installation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.device_push_tokens SET enabled = false, updated_at = now() WHERE user_id = auth.uid() AND installation_id = p_installation_id;
END $$;
REVOKE ALL ON FUNCTION public.register_device_push_token(uuid,text,text,uuid), public.unregister_device_push_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_push_token(uuid,text,text,uuid), public.unregister_device_push_token(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_order_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.customer_id IS NULL OR NEW.status NOT IN ('ready', 'cancelled') THEN RETURN NEW; END IF;
  -- A stale ready notification must not be sent after cancellation.
  UPDATE public.order_notification_outbox SET state = 'superseded', lease_id = NULL, leased_until = NULL, updated_at = now()
    WHERE order_id = NEW.id AND event_status <> NEW.status::text AND state IN ('pending', 'processing', 'awaiting_receipts');
  INSERT INTO public.order_notification_outbox(order_id, customer_id, event_status)
    VALUES (NEW.id, NEW.customer_id, NEW.status::text) ON CONFLICT (order_id, event_status) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_order_notification() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER orders_notification_outbox AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_notification();

-- All worker RPCs below are accessible ONLY to service_role. The Edge Function
-- separately checks staff JWT / a dedicated worker secret before using them.
CREATE OR REPLACE FUNCTION public.claim_order_notifications(p_order_id uuid DEFAULT NULL, p_limit integer DEFAULT 5)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event record; v_lease uuid;
BEGIN
  FOR v_event IN
    SELECT n.*, o.order_number, o.status::text AS current_status FROM public.order_notification_outbox n JOIN public.orders o ON o.id = n.order_id
      WHERE (p_order_id IS NULL OR n.order_id = p_order_id)
        AND ((n.state IN ('pending', 'awaiting_receipts') AND n.available_at <= now()) OR (n.state = 'processing' AND n.leased_until < now()))
      ORDER BY n.available_at, n.id LIMIT greatest(1, least(coalesce(p_limit, 5), 10)) FOR UPDATE OF n SKIP LOCKED
  LOOP
    IF v_event.current_status IS DISTINCT FROM v_event.event_status THEN
      UPDATE public.order_notification_outbox SET state = 'superseded', lease_id = NULL, leased_until = NULL, updated_at = now() WHERE id = v_event.id;
      CONTINUE;
    END IF;
    v_lease := gen_random_uuid();
    UPDATE public.order_notification_outbox SET state = 'processing', lease_id = v_lease, leased_until = now() + interval '120 seconds', attempts = attempts + 1, updated_at = now() WHERE id = v_event.id;
    INSERT INTO public.order_notification_deliveries(outbox_id, device_id, delivered_token)
      SELECT v_event.id, t.id, t.expo_push_token FROM public.device_push_tokens t WHERE t.user_id = v_event.customer_id AND t.enabled
      ON CONFLICT (outbox_id, device_id) DO NOTHING;
    UPDATE public.order_notification_deliveries d SET state = 'disabled', last_error_code = 'OPTED_OUT_OR_ACCOUNT_CHANGED', updated_at = now()
      WHERE d.outbox_id = v_event.id AND d.state IN ('pending', 'retry') AND NOT EXISTS (
        SELECT 1 FROM public.device_push_tokens t WHERE t.id = d.device_id AND t.user_id = v_event.customer_id AND t.enabled AND t.expo_push_token = d.delivered_token
      );
    UPDATE public.order_notification_deliveries SET state = 'failed', last_error_code = 'RETRY_LIMIT', updated_at = now()
      WHERE outbox_id = v_event.id AND state IN ('pending', 'retry') AND attempts >= 5;
    UPDATE public.order_notification_deliveries SET attempts = attempts + 1, updated_at = now()
      WHERE outbox_id = v_event.id AND state IN ('pending', 'retry') AND next_attempt_at <= now();
    RETURN NEXT jsonb_build_object('id', v_event.id, 'lease_id', v_lease, 'order_id', v_event.order_id,
      'order_number', v_event.order_number, 'customer_id', v_event.customer_id, 'event_status', v_event.event_status,
      'deliveries', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'device_id', d.device_id, 'token', d.delivered_token,
        'state', d.state, 'attempts', d.attempts, 'ticket_id', d.ticket_id, 'ticket_created_at', d.ticket_created_at))
        FROM public.order_notification_deliveries d WHERE d.outbox_id = v_event.id AND d.state IN ('pending', 'retry', 'ticketed') AND d.next_attempt_at <= now()), '[]'::jsonb));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.record_order_notification_result(p_outbox_id uuid, p_lease_id uuid, p_delivery_id uuid, p_state text, p_ticket_id text DEFAULT NULL, p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event public.order_notification_outbox%ROWTYPE; v_delivery public.order_notification_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public.order_notification_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND OR v_event.state <> 'processing' OR v_event.lease_id IS DISTINCT FROM p_lease_id OR v_event.leased_until <= now() THEN RETURN false; END IF;
  IF p_state NOT IN ('retry', 'ticketed', 'delivered', 'disabled', 'failed') OR p_state IS NULL THEN RAISE EXCEPTION 'INVALID_DELIVERY_STATE'; END IF;
  SELECT * INTO v_delivery FROM public.order_notification_deliveries WHERE id = p_delivery_id AND outbox_id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_delivery.state NOT IN ('pending', 'retry', 'ticketed') THEN RETURN false; END IF;
  IF p_state = 'ticketed' AND (p_ticket_id IS NULL OR length(p_ticket_id) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'INVALID_PUSH_TICKET'; END IF;
  UPDATE public.order_notification_deliveries SET
    state = CASE WHEN p_state = 'retry' AND attempts >= 5 THEN 'failed' ELSE p_state END,
    ticket_id = CASE WHEN p_state = 'ticketed' THEN p_ticket_id ELSE ticket_id END,
    ticket_created_at = CASE WHEN p_state = 'ticketed' AND ticket_id IS DISTINCT FROM p_ticket_id THEN now() ELSE ticket_created_at END,
    next_attempt_at = CASE WHEN p_state = 'ticketed' THEN now() + interval '15 minutes'
      WHEN p_state = 'retry' THEN now() + least(1800, (power(2, greatest(attempts, 1)) * 15)::integer) * interval '1 second' ELSE next_attempt_at END,
    last_error_code = left(p_error_code, 100), updated_at = now() WHERE id = p_delivery_id;
  IF p_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.device_push_tokens SET enabled = false, last_error_code = 'DeviceNotRegistered', updated_at = now()
      WHERE id = v_delivery.device_id AND user_id = v_event.customer_id AND expo_push_token = v_delivery.delivered_token;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.renew_order_notification_lease(p_outbox_id uuid, p_lease_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.order_notification_outbox n SET leased_until = now() + interval '120 seconds', updated_at = now()
    WHERE n.id = p_outbox_id AND n.state = 'processing' AND n.lease_id = p_lease_id AND n.leased_until > now()
      AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id = n.order_id AND o.customer_id = n.customer_id AND o.status::text = n.event_status);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.finish_order_notification(p_outbox_id uuid, p_lease_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event public.order_notification_outbox%ROWTYPE; v_due timestamptz; v_state text;
BEGIN
  SELECT * INTO v_event FROM public.order_notification_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND OR v_event.state <> 'processing' OR v_event.lease_id IS DISTINCT FROM p_lease_id OR v_event.leased_until <= now() THEN RETURN false; END IF;
  SELECT min(next_attempt_at) INTO v_due FROM public.order_notification_deliveries WHERE outbox_id = p_outbox_id AND state IN ('pending', 'retry', 'ticketed');
  IF v_due IS NOT NULL THEN
    v_state := CASE WHEN EXISTS(SELECT 1 FROM public.order_notification_deliveries WHERE outbox_id = p_outbox_id AND state IN ('pending','retry')) THEN 'pending' ELSE 'awaiting_receipts' END;
  ELSIF EXISTS(SELECT 1 FROM public.order_notification_deliveries WHERE outbox_id = p_outbox_id AND state = 'failed') THEN v_state := 'failed';
  ELSIF EXISTS(SELECT 1 FROM public.order_notification_deliveries WHERE outbox_id = p_outbox_id AND state = 'delivered') THEN v_state := 'sent';
  ELSE v_state := 'no_devices'; END IF;
  UPDATE public.order_notification_outbox SET state = v_state, available_at = coalesce(v_due, now()), lease_id = NULL, leased_until = NULL, updated_at = now() WHERE id = p_outbox_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_order_notifications(uuid,integer), public.record_order_notification_result(uuid,uuid,uuid,text,text,text), public.finish_order_notification(uuid,uuid), public.renew_order_notification_lease(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_notifications(uuid,integer), public.record_order_notification_result(uuid,uuid,uuid,text,text,text), public.finish_order_notification(uuid,uuid), public.renew_order_notification_lease(uuid,uuid) TO service_role;

CREATE TABLE public.account_deletion_requests (
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  public_message text NOT NULL DEFAULT 'Запрос ожидает проверки сотрудником кофейни. Аккаунт пока не удалён.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_deletion_requests_own_read ON public.account_deletion_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.get_account_deletion_request()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_request FROM public.account_deletion_requests WHERE user_id = auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', v_request.id, 'status', v_request.status, 'created_at', v_request.created_at,
    'public_message', v_request.public_message, 'active_order_count', (SELECT count(*) FROM public.orders WHERE customer_id = auth.uid() AND status NOT IN ('completed','cancelled')));
END $$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.account_deletion_requests(user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO UPDATE
    SET status = 'pending', public_message = 'Запрос ожидает проверки сотрудником кофейни. Аккаунт пока не удалён.', updated_at = now()
    WHERE account_deletion_requests.status = 'rejected';
  -- Never delete auth.users here: existing order/reward history must remain
  -- consistent and active orders require staff review. No false success state.
  RETURN public.get_account_deletion_request();
END $$;
REVOKE ALL ON FUNCTION public.get_account_deletion_request(), public.request_account_deletion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_request(), public.request_account_deletion() TO authenticated;

COMMENT ON TABLE public.account_deletion_requests IS 'Manual deletion queue. A pending request is not an account deletion; staff must apply an approved retention/anonymization procedure.';
COMMENT ON TABLE public.order_notification_outbox IS 'One event per order/status; HTTP worker uses leases, per-device delivery tickets and Expo receipts. Network retries are at-least-once, not exactly-once transport.';
NOTIFY pgrst, 'reload schema';
COMMIT;
