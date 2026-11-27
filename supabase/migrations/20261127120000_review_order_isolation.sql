-- Server-owned review identity; its phone is populated locally on VPS from the
-- existing REVIEW_DEMO_PHONE. Never put that value in this migration or client.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE public.review_access_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 phone text NOT NULL CHECK (phone ~ '^\+7000000[0-9]{4}$')
);
ALTER TABLE public.review_access_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_access_settings FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.review_access_settings(singleton, phone)
 VALUES (true, current_setting('sbl.review_phone', true));

DO $$
BEGIN
 IF (SELECT count(*) FROM auth.users u JOIN public.review_access_settings r
     ON regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(r.phone, '\D', '', 'g')) <> 1
 OR EXISTS (SELECT 1 FROM auth.users u JOIN public.staff s ON s.user_id = u.id
     CROSS JOIN public.review_access_settings r
     WHERE regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(r.phone, '\D', '', 'g')) THEN
  RAISE EXCEPTION 'REVIEW_IDENTITY_NOT_UNIQUE_OR_STAFF';
 END IF;
 IF EXISTS (SELECT 1 FROM public.orders o JOIN auth.users u ON u.id = o.customer_id
    CROSS JOIN public.review_access_settings r
    WHERE regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(r.phone, '\D', '', 'g')
      AND (o.status::text = 'completed' OR o.paid_at IS NOT NULL)) THEN
  RAISE EXCEPTION 'REVIEW_ACCOUNT_HAS_PAID_ORDERS';
 END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN is_review_order boolean NOT NULL DEFAULT false;
UPDATE public.orders o SET is_review_order = true FROM auth.users u, public.review_access_settings r
 WHERE u.id = o.customer_id
   AND regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(r.phone, '\D', '', 'g');
UPDATE public.order_notification_outbox n
 SET state = 'superseded', lease_id = NULL, leased_until = NULL, updated_at = now()
 FROM public.orders o WHERE o.id = n.order_id AND o.is_review_order
   AND n.state IN ('pending', 'processing', 'awaiting_receipts');
UPDATE public.marketing_push_queue q
 SET state = 'disabled', last_error_code = 'REVIEW_ACCOUNT', lease_id = NULL,
     leased_until = NULL, updated_at = now()
 FROM auth.users u, public.review_access_settings r
 WHERE q.user_id = u.id AND regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(r.phone, '\D', '', 'g')
   AND q.state IN ('pending', 'retry', 'processing');

CREATE FUNCTION public.review_order_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.is_review_order := EXISTS (
   SELECT 1 FROM auth.users u CROSS JOIN public.review_access_settings r
   WHERE u.id = NEW.customer_id
     AND regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(r.phone, '\D', '', 'g')
  );
 ELSIF NEW.is_review_order IS DISTINCT FROM OLD.is_review_order THEN
  RAISE EXCEPTION 'REVIEW_FLAG_IMMUTABLE' USING ERRCODE = '42501';
 END IF;
 IF NEW.is_review_order AND (NEW.status::text = 'completed' OR NEW.paid_at IS NOT NULL) THEN
  RAISE EXCEPTION 'REVIEW_PAYMENT_NOT_ALLOWED' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.review_order_identity_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER orders_000_review_identity BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.review_order_identity_guard();

-- Restrictive policies narrow existing policies; they grant no new access.
-- Review customers retain access to their own orders; staff's ordinary queue
-- cannot see review orders or their items, including retained anonymized rows.
CREATE POLICY review_orders_select_isolation ON public.orders AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT is_review_order OR customer_id = auth.uid());
CREATE POLICY review_items_select_isolation ON public.order_items AS RESTRICTIVE
FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
         AND (NOT o.is_review_order OR o.customer_id = auth.uid()))
);

-- No price, quote, idempotency, bonus or checkout function is replaced here.
-- PostgreSQL stores these functions with a $function$ wrapper; patch exactly
-- one validated body anchor and fail closed if the deployed definition drifts.
DO $patch$
DECLARE definition text; needle text;
BEGIN
 definition := pg_get_functiondef('public.enqueue_order_notification()'::regprocedure);
 needle := E'BEGIN\n';
 IF (length(definition)-length(replace(definition, needle, ''))) / length(needle) <> 1 THEN
  RAISE EXCEPTION 'PUSH_DEFINITION_DRIFT';
 END IF;
 EXECUTE replace(definition, needle,
  E'BEGIN\n  IF NEW.is_review_order THEN RETURN NEW; END IF;\n');

 definition := pg_get_functiondef('public.prepare_account_deletion(uuid)'::regprocedure);
 needle := E' INSERT INTO public.reward_progress(customer_id) VALUES (p_user) ON CONFLICT DO NOTHING;\n PERFORM 1 FROM public.reward_progress r WHERE r.customer_id = p_user FOR UPDATE;';
 IF (length(definition)-length(replace(definition, needle, ''))) / length(needle) <> 1 THEN
  RAISE EXCEPTION 'DELETION_DEFINITION_DRIFT';
 END IF;
 EXECUTE replace(definition, needle, needle || E'\n -- Cancel only this account''s server-marked review orders before normal deletion.\n UPDATE public.orders SET status = ''cancelled'', updated_at = clock_timestamp()\n  WHERE customer_id = p_user AND is_review_order\n    AND status::text IN (''new'', ''accepted'', ''preparing'', ''ready'');');
END $patch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
