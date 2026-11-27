\set ON_ERROR_STOP on
-- Run in an empty disposable local PostgreSQL database.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES auth.users(id),
  status text NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.app_publications (id uuid PRIMARY KEY);
CREATE TABLE public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  expo_push_token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  event_status text CONSTRAINT order_notification_outbox_event_status_check CHECK (event_status IN ('ready', 'cancelled')),
  state text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  leased_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_status)
);
CREATE TABLE public.order_notification_deliveries (outbox_id uuid NOT NULL);

\ir ../../supabase/migrations/20261110100000_push_campaigns.sql
\ir ../../supabase/migrations/20261126120000_return_reminders.sql
\ir ../../supabase/migrations/20261126121000_order_received_push.sql

BEGIN;
-- Pin business hours without altering the production migration.
CREATE OR REPLACE FUNCTION public.shop_is_open(p_at timestamptz DEFAULT now()) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.shop_window_end(p_at timestamptz DEFAULT now()) RETURNS timestamptz
  LANGUAGE sql STABLE AS $$ SELECT now() + interval '1 hour' $$;

DO $$
DECLARE guest uuid := gen_random_uuid(); other_guest uuid := gen_random_uuid(); latest_device uuid;
BEGIN
  IF has_function_privilege('authenticated', 'public.enqueue_return_reminders()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.set_return_reminders(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'return reminders permissions too broad';
  END IF;
  INSERT INTO auth.users VALUES (guest), (other_guest);
  INSERT INTO public.device_push_tokens(user_id, expo_push_token, updated_at) VALUES (guest, 'older', now() - interval '1 day');
  INSERT INTO public.device_push_tokens(user_id, expo_push_token) VALUES (guest, 'latest') RETURNING id INTO latest_device;
  INSERT INTO public.orders(customer_id, status, paid_at) VALUES (guest, 'completed', now() - interval '6 days');
  PERFORM set_config('test.user_id', guest::text, true);
  IF (public.get_push_preferences()->>'return_reminders')::boolean OR public.enqueue_return_reminders() <> 0 THEN
    RAISE EXCEPTION 'default consent enabled';
  END IF;
  PERFORM public.set_return_reminders(true);
  PERFORM public.set_push_preferences(false, false);
  IF NOT (public.get_push_preferences()->>'return_reminders')::boolean OR public.enqueue_return_reminders() <> 0 THEN
    RAISE EXCEPTION 'legacy preference write or recent order handling failed';
  END IF;
  UPDATE public.orders SET paid_at = now() - interval '7 days' WHERE customer_id = guest;
  IF public.enqueue_return_reminders() <> 1 THEN RAISE EXCEPTION 'eligible order was not queued'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketing_push_queue WHERE user_id = guest AND device_id = latest_device AND data->>'type' = 'return_reminder') OR public.enqueue_return_reminders() <> 0 THEN
    RAISE EXCEPTION 'wrong device or duplicate queued';
  END IF;
  PERFORM public.set_return_reminders(false);
  IF EXISTS (SELECT 1 FROM public.claim_marketing_pushes(50)) THEN RAISE EXCEPTION 'opted-out reminder claimed'; END IF;
  DELETE FROM public.marketing_push_queue;
  PERFORM public.set_return_reminders(true);
  IF public.enqueue_return_reminders() <> 0 THEN RAISE EXCEPTION 'deleting old queue rows rearmed the same order'; END IF;
  INSERT INTO public.orders(customer_id, status, paid_at) VALUES (guest, 'completed', now() - interval '1 minute');
  IF public.enqueue_return_reminders() <> 0 THEN RAISE EXCEPTION 'new purchase did not reset the clock'; END IF;
  -- Simulate a new inactivity episode by aging both orders.
  UPDATE public.orders SET paid_at = paid_at - interval '15 days' WHERE customer_id = guest;
  IF public.enqueue_return_reminders() <> 1 THEN RAISE EXCEPTION 'new inactivity episode was not queued'; END IF;
  INSERT INTO public.orders(customer_id, status) VALUES (guest, 'new');
  IF EXISTS (SELECT 1 FROM public.claim_marketing_pushes(50)) THEN RAISE EXCEPTION 'stale reminder claimed after new order'; END IF;
  RAISE NOTICE 'PASS: default opt-out, grants, 7 days, latest device, persistence after cleanup, opt-out, repeat episode, stale order';
END $$;

CREATE TRIGGER orders_notification_outbox AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_notification();
DO $$
DECLARE guest uuid := gen_random_uuid(); coffee_order uuid;
BEGIN
  INSERT INTO auth.users VALUES (guest);
  INSERT INTO public.orders(customer_id, status) VALUES (guest, 'new') RETURNING id INTO coffee_order;
  IF NOT EXISTS (SELECT 1 FROM public.order_notification_outbox WHERE order_id = coffee_order AND event_status = 'new' AND state = 'pending') THEN
    RAISE EXCEPTION 'order creation did not queue its notification';
  END IF;
  UPDATE public.orders SET status = 'accepted' WHERE id = coffee_order;
  UPDATE public.orders SET status = 'preparing' WHERE id = coffee_order;
  UPDATE public.orders SET status = 'preparing' WHERE id = coffee_order;
  UPDATE public.orders SET status = 'ready' WHERE id = coffee_order;
  IF (SELECT count(*) FROM public.order_notification_outbox WHERE order_id = coffee_order AND state = 'superseded') <> 3
    OR NOT EXISTS (SELECT 1 FROM public.order_notification_outbox WHERE order_id = coffee_order AND event_status = 'ready' AND state = 'pending') THEN
    RAISE EXCEPTION 'order status transitions did not preserve a single current notification';
  END IF;
  RAISE NOTICE 'PASS: new, accepted, preparing and ready queued once; stale notifications superseded';
END $$;
ROLLBACK;
