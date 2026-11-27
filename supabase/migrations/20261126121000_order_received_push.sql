BEGIN;

ALTER TABLE public.order_notification_outbox
  DROP CONSTRAINT order_notification_outbox_event_status_check,
  ADD CONSTRAINT order_notification_outbox_event_status_check
    CHECK (event_status IN ('new', 'accepted', 'preparing', 'ready', 'cancelled'));

CREATE OR REPLACE FUNCTION public.enqueue_order_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- A new order supersedes reminders to place one.
  IF NEW.customer_id IS NOT NULL AND NEW.status::text <> 'cancelled' THEN
    UPDATE public.marketing_push_queue SET state = 'disabled', last_error_code = 'ORDER_PLACED', lease_id = NULL, leased_until = NULL, updated_at = now()
      WHERE user_id = NEW.customer_id AND kind IN ('series_reminder', 'return_reminder') AND state IN ('pending', 'retry', 'processing');
  END IF;
  IF NEW.customer_id IS NULL OR NEW.status NOT IN ('new', 'accepted', 'preparing', 'ready', 'cancelled') THEN RETURN NEW; END IF;
  -- Send only the current order status when several transitions happen before dispatch.
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

NOTIFY pgrst, 'reload schema';
COMMIT;
