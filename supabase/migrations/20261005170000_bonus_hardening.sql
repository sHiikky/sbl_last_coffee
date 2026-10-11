BEGIN;
-- Do not silently discard historical duplicates or guess how to reconcile them.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.bonus_transactions WHERE order_id IS NOT NULL
   GROUP BY order_id,type HAVING count(*)>1) THEN
  RAISE EXCEPTION 'BONUS_HISTORY_REQUIRES_REVIEW: duplicate order/type transactions';
 END IF;
 IF EXISTS(SELECT 1 FROM public.orders o JOIN public.bonus_transactions t ON t.order_id=o.id
   WHERE t.customer_id IS DISTINCT FROM o.customer_id
      OR (t.type='earn' AND (t.amount<>o.bonus_earned OR o.status='cancelled'))) THEN
  RAISE EXCEPTION 'BONUS_HISTORY_REQUIRES_REVIEW: inconsistent or cancelled historical earnings';
 END IF;
 IF EXISTS(SELECT 1 FROM public.orders o WHERE o.bonus_earned>0
   AND NOT EXISTS(SELECT 1 FROM public.bonus_transactions t WHERE t.order_id=o.id AND t.type='earn')) THEN
  RAISE EXCEPTION 'BONUS_HISTORY_REQUIRES_REVIEW: missing earning journal';
 END IF;
 IF EXISTS(SELECT 1 FROM public.orders o WHERE o.bonus_earned>0
   AND NOT EXISTS(SELECT 1 FROM public.bonus_accounts a WHERE a.customer_id=o.customer_id)) THEN
  RAISE EXCEPTION 'BONUS_HISTORY_REQUIRES_REVIEW: earned order without account';
 END IF;
END $$;

ALTER TABLE public.bonus_accounts ADD COLUMN debt integer NOT NULL DEFAULT 0 CHECK(debt>=0);
ALTER TABLE public.bonus_accounts ADD CONSTRAINT bonus_accounts_balance_or_debt CHECK(balance=0 OR debt=0);
ALTER TABLE public.bonus_accounts ADD CONSTRAINT bonus_accounts_lifetime_nonnegative CHECK(lifetime_paid>=0);
ALTER TABLE public.orders ADD COLUMN bonus_settled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN bonus_cash_paid numeric NOT NULL DEFAULT 0 CHECK(bonus_cash_paid>=0);
ALTER TABLE public.orders ADD COLUMN bonus_reversed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN bonus_earned_original integer NOT NULL DEFAULT 0 CHECK(bonus_earned_original>=0);

-- Preserve completion without retroactive payouts. No account and no earnings
-- means no historical cash contribution was recorded to reverse on cancellation.
UPDATE public.orders o SET bonus_settled_at=coalesce(
 (SELECT t.created_at FROM public.bonus_transactions t WHERE t.order_id=o.id AND t.type='earn'),
 o.updated_at,o.created_at,now()), bonus_cash_paid=CASE
 WHEN EXISTS(SELECT 1 FROM public.bonus_accounts a WHERE a.customer_id=o.customer_id)
 THEN greatest(o.total-o.bonus_redeemed,0) ELSE 0 END,bonus_earned_original=o.bonus_earned
WHERE o.status='completed' OR o.bonus_earned>0;

ALTER TABLE public.bonus_transactions DROP CONSTRAINT bonus_transactions_type_check;
ALTER TABLE public.bonus_transactions ADD CONSTRAINT bonus_transactions_type_check
 CHECK(type IN ('earn','redeem','refund','earn_reversal'));
CREATE UNIQUE INDEX bonus_transactions_order_type_unique ON public.bonus_transactions(order_id,type)
 WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_order_bonus_redeem() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_balance integer;
BEGIN
 IF NEW.customer_id IS NULL OR NEW.bonus_redeemed=0 THEN RETURN NEW; END IF;
 IF NEW.bonus_redeemed<0 OR NEW.bonus_redeemed>floor(NEW.total*0.5) THEN
  RAISE EXCEPTION 'BONUS_REDEEM_INVALID: exceeds order limit' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.bonus_accounts(customer_id) VALUES(NEW.customer_id) ON CONFLICT DO NOTHING;
 SELECT balance INTO v_balance FROM public.bonus_accounts WHERE customer_id=NEW.customer_id FOR UPDATE;
 IF NEW.bonus_redeemed>v_balance THEN
  RAISE EXCEPTION 'BONUS_BALANCE_CHANGED: insufficient available balance' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.bonus_transactions(customer_id,order_id,type,amount)
 VALUES(NEW.customer_id,NEW.id,'redeem',NEW.bonus_redeemed);
 UPDATE public.bonus_accounts SET balance=balance-NEW.bonus_redeemed,updated_at=clock_timestamp()
 WHERE customer_id=NEW.customer_id;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_order_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.bonus_accounts%ROWTYPE; v_earned integer; v_cash numeric;
 v_net bigint; v_refund integer:=0; v_reverse integer:=0; v_lifetime numeric;
BEGIN
 IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.total IS DISTINCT FROM OLD.total
 OR NEW.bonus_redeemed IS DISTINCT FROM OLD.bonus_redeemed
 OR NEW.bonus_earned IS DISTINCT FROM OLD.bonus_earned
 OR NEW.bonus_earned_original IS DISTINCT FROM OLD.bonus_earned_original
 OR NEW.bonus_refunded IS DISTINCT FROM OLD.bonus_refunded
 OR NEW.bonus_settled_at IS DISTINCT FROM OLD.bonus_settled_at
 OR NEW.bonus_cash_paid IS DISTINCT FROM OLD.bonus_cash_paid
 OR NEW.bonus_reversed_at IS DISTINCT FROM OLD.bonus_reversed_at THEN
  RAISE EXCEPTION 'BONUS_FIELDS_IMMUTABLE' USING ERRCODE='22023';
 END IF;
 IF OLD.status='cancelled' AND NEW.status<>'cancelled' THEN
  RAISE EXCEPTION 'BONUS_CANCELLED_ORDER_FINAL' USING ERRCODE='22023';
 END IF;
 IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.status NOT IN ('completed','cancelled') THEN RETURN NEW; END IF;
 -- orders_00_reward_before has acquired the customer progress lock first.
 INSERT INTO public.bonus_accounts(customer_id) VALUES(NEW.customer_id) ON CONFLICT DO NOTHING;
 SELECT * INTO a FROM public.bonus_accounts WHERE customer_id=NEW.customer_id FOR UPDATE;
 IF NEW.status='completed' AND OLD.bonus_settled_at IS NULL THEN
  v_cash:=greatest(NEW.total-NEW.bonus_redeemed,0);
  v_earned:=floor(v_cash*public.bonus_rate_for(a.lifetime_paid))::integer;
  v_net:=a.balance::bigint-a.debt::bigint+v_earned;
  IF v_earned>0 THEN
   INSERT INTO public.bonus_transactions(customer_id,order_id,type,amount)
   VALUES(NEW.customer_id,NEW.id,'earn',v_earned);
  END IF;
  UPDATE public.bonus_accounts SET balance=greatest(v_net,0)::integer,debt=greatest(-v_net,0)::integer,
   lifetime_paid=a.lifetime_paid+v_cash,updated_at=clock_timestamp() WHERE customer_id=NEW.customer_id;
  NEW.bonus_earned:=v_earned;
  NEW.bonus_earned_original:=v_earned;
  NEW.bonus_cash_paid:=v_cash;
  NEW.bonus_settled_at:=clock_timestamp();
 END IF;
 IF NEW.status='cancelled' THEN
  v_lifetime:=a.lifetime_paid;
  IF OLD.bonus_settled_at IS NOT NULL AND OLD.bonus_reversed_at IS NULL THEN
   v_reverse:=OLD.bonus_earned_original;
   v_lifetime:=a.lifetime_paid-OLD.bonus_cash_paid;
   IF v_lifetime<0 THEN
    RAISE EXCEPTION 'BONUS_ACCOUNT_INCONSISTENT: lifetime smaller than reversal' USING ERRCODE='22023';
   END IF;
   IF v_reverse>0 THEN
    INSERT INTO public.bonus_transactions(customer_id,order_id,type,amount)
    VALUES(NEW.customer_id,NEW.id,'earn_reversal',v_reverse);
   END IF;
   NEW.bonus_reversed_at:=clock_timestamp();
   NEW.bonus_earned:=0;
  END IF;
  IF NOT OLD.bonus_refunded THEN
   v_refund:=OLD.bonus_redeemed;
   IF v_refund>0 THEN
    INSERT INTO public.bonus_transactions(customer_id,order_id,type,amount)
    VALUES(NEW.customer_id,NEW.id,'refund',v_refund);
   END IF;
   NEW.bonus_refunded:=true;
  END IF;
  v_net:=a.balance::bigint-a.debt::bigint-v_reverse+v_refund;
  UPDATE public.bonus_accounts SET balance=greatest(v_net,0)::integer,debt=greatest(-v_net,0)::integer,
   lifetime_paid=v_lifetime,updated_at=clock_timestamp() WHERE customer_id=NEW.customer_id;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.bonus_order_initialize() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='cancelled' THEN
  RAISE EXCEPTION 'BONUS_INVALID_INITIAL_STATUS' USING ERRCODE='22023';
 END IF;
 NEW.bonus_earned:=0; NEW.bonus_earned_original:=0; NEW.bonus_refunded:=false;
 NEW.bonus_settled_at:=NULL; NEW.bonus_cash_paid:=0; NEW.bonus_reversed_at:=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER orders_01_bonus_initialize BEFORE INSERT ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.bonus_order_initialize();

CREATE FUNCTION public.bonus_settle_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND NEW.customer_id IS NOT NULL THEN
  UPDATE public.orders SET status='completed' WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER orders_z_bonus_settle_insert AFTER INSERT ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.bonus_settle_insert();

REVOKE ALL ON FUNCTION public.handle_order_bonus_redeem() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.handle_order_status_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bonus_order_initialize() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bonus_settle_insert() FROM PUBLIC,anon,authenticated;
COMMENT ON COLUMN public.bonus_accounts.debt IS 'Reversed earned points already spent; future earnings/refunds pay this first. Never redeemable.';
COMMENT ON COLUMN public.orders.bonus_earned IS 'Active earned points; zero after cancellation.';
COMMENT ON COLUMN public.orders.bonus_earned_original IS 'Immutable original earning amount for cancellation and audit.';
COMMIT;
