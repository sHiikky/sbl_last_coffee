DO $$
DECLARE u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); z uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.bonus_accounts(customer_id,balance,lifetime_paid) VALUES(u,100,9000);
 INSERT INTO public.orders(id,customer_id,total,status,bonus_redeemed) VALUES(a,u,200,'new',20);
 UPDATE public.orders SET status='completed' WHERE id=a;
 UPDATE public.orders SET status='ready' WHERE id=a;
 UPDATE public.orders SET status='completed' WHERE id=a;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=89 AND lifetime_paid=9180 AND debt=0)
 OR (SELECT count(*) FROM public.bonus_transactions WHERE order_id=a AND type='earn')<>1 THEN
  RAISE EXCEPTION 'TEST_FAILED: completion/repeated completion';
 END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=a;
 UPDATE public.orders SET status='cancelled' WHERE id=a;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=100 AND lifetime_paid=9000 AND debt=0)
 OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=a AND bonus_earned=0 AND bonus_earned_original=9 AND bonus_reversed_at IS NOT NULL)
 OR (SELECT count(*) FROM public.bonus_transactions WHERE order_id=a)<>4 THEN
  RAISE EXCEPTION 'TEST_FAILED: exact cancellation and repeat';
 END IF;
 BEGIN
  UPDATE public.orders SET status='completed' WHERE id=a;
  RAISE EXCEPTION 'TEST_FAILED: cancelled order reopened';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'BONUS_CANCELLED_ORDER_FINAL%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.bonus_transactions(customer_id,order_id,type,amount) VALUES(u,a,'earn',9);
  RAISE EXCEPTION 'TEST_FAILED: duplicate earning';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.orders SET bonus_earned_original=99 WHERE id=a;
  RAISE EXCEPTION 'TEST_FAILED: writable snapshot';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'BONUS_FIELDS_IMMUTABLE%' THEN RAISE; END IF;
 END;
 -- Fresh account: spent earnings must become debt, not prevent cancellation.
 u:=gen_random_uuid(); a:=gen_random_uuid();
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.orders(id,customer_id,total,status) VALUES(a,u,100,'completed');
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=5 AND lifetime_paid=100) THEN
  RAISE EXCEPTION 'TEST_FAILED: completed insert';
 END IF;
 INSERT INTO public.orders(id,customer_id,total,status,bonus_redeemed) VALUES(b,u,10,'new',5);
 UPDATE public.orders SET status='cancelled' WHERE id=a;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=0 AND debt=5 AND lifetime_paid=0) THEN
  RAISE EXCEPTION 'TEST_FAILED: spent earning reversal';
 END IF;
 INSERT INTO public.orders(id,customer_id,total,status) VALUES(c,u,100,'completed');
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=0 AND debt=0 AND lifetime_paid=100) THEN
  RAISE EXCEPTION 'TEST_FAILED: future earning settles debt';
 END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=b;
 UPDATE public.orders SET status='cancelled' WHERE id=b;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=5 AND debt=0 AND lifetime_paid=100) THEN
  RAISE EXCEPTION 'TEST_FAILED: single refund';
 END IF;
 INSERT INTO public.orders(id,customer_id,total,status) VALUES(z,u,1,'new');
 UPDATE public.orders SET status='completed' WHERE id=z;
 UPDATE public.orders SET status='ready' WHERE id=z;
 UPDATE public.orders SET status='completed' WHERE id=z;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND lifetime_paid=101) THEN
  RAISE EXCEPTION 'TEST_FAILED: zero earning repeated cash';
 END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=z;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND lifetime_paid=100)
 OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE order_id=z) THEN
  RAISE EXCEPTION 'TEST_FAILED: zero earning cancellation';
 END IF;
 IF has_function_privilege('authenticated','public.handle_order_status_change()','EXECUTE')
 OR has_function_privilege('anon','public.handle_order_bonus_redeem()','EXECUTE') THEN
  RAISE EXCEPTION 'TEST_FAILED: internal function privileges';
 END IF;
 RAISE NOTICE 'PASS: repeated completion, exact cancellation, single refund, spent earning debt, debt repayment, zero earnings, completed insert, immutable snapshots, duplicate journal, privileges';
END $$;
ROLLBACK;
