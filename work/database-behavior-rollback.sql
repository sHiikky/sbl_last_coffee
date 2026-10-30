-- SBL behavior regression checks. Target project: vxefueynagwuavlyeiqc.
-- Run the ENTIRE file in Supabase SQL Editor as postgres.
-- Each suite creates its own fixtures and rolls them back in a subtransaction.
-- Existing catalog rows and customer rows are not test targets.
-- No schema reset, migrations, trigger disabling, or COMMIT.
-- Order-number sequence increments are not rolled back.
-- Sequential checks only: concurrent requests need two separate sessions.
ROLLBACK;
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '3s';

DO $runner$
DECLARE
 suite record;
 original_role text := current_user;
 results jsonb := '[]'::jsonb;
 before_counts jsonb;
 after_counts jsonb;
 suite_ok boolean;
 error_message text;
 error_state text;
BEGIN
 IF original_role <> 'postgres' THEN
  RAISE EXCEPTION 'Run this file as postgres in the coffee project.';
 END IF;
 IF to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NULL
 OR to_regprocedure('public.get_loyalty_state()') IS NULL
 OR to_regprocedure('public.set_product_availability(uuid,boolean,boolean)') IS NULL
 OR to_regclass('public.bonus_accounts') IS NULL
 OR to_regclass('public.reward_entitlements') IS NULL THEN
  RAISE EXCEPTION 'Coffee schema not found. Check the selected project. Nothing tested.';
 END IF;
 IF NOT pg_try_advisory_xact_lock(603810120261018::bigint) THEN
  RAISE EXCEPTION 'This regression suite is already running in another session.';
 END IF;
 SELECT jsonb_build_object(
 'users',(SELECT count(*) FROM auth.users),
 'products',(SELECT count(*) FROM public.products),
 'orders',(SELECT count(*) FROM public.orders),
 'items',(SELECT count(*) FROM public.order_items),
 'accounts',(SELECT count(*) FROM public.bonus_accounts),
 'transactions',(SELECT count(*) FROM public.bonus_transactions),
 'progress',(SELECT count(*) FROM public.reward_progress),
 'rewards',(SELECT count(*) FROM public.reward_entitlements),
 'staff',(SELECT count(*) FROM public.staff)
) INTO before_counts;

 FOR suite IN
  SELECT * FROM (VALUES
('01 quote, changed price, idempotent retry and single debit', $suite_0$
DO $$
DECLARE u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); k uuid:=gen_random_uuid();
 items jsonb; quote jsonb; o record; retry record; d date:=(clock_timestamp() AT TIME ZONE 'Asia/Tomsk')::date;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_visible)
 VALUES(p,-2100000301,'price test','test',U&'\0414\0435\0441\0435\0440\0442\044B',100,true);
 INSERT INTO public.bonus_accounts(customer_id,balance) VALUES(u,50);
 INSERT INTO public.reward_entitlements(customer_id,streak_start_day,reward_cycle,earned_at,expires_at)
 VALUES(u,d-9,1,clock_timestamp(),clock_timestamp()+interval '720 hours');
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 items:=jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2));
 quote:=jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,2,100)),'payable',80);
 UPDATE public.products SET price=120 WHERE id=p;
 BEGIN
  PERFORM * FROM public.create_order(k,items,NULL,true,20,quote);
  RAISE EXCEPTION 'TEST_FAILED: price increase was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'PRICE_CHANGED:%' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.orders WHERE customer_id=u)
 OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE customer_id=u)
 OR (SELECT balance FROM public.bonus_accounts WHERE customer_id=u)<>50
 OR EXISTS(SELECT 1 FROM public.reward_entitlements WHERE customer_id=u AND redeemed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'TEST_FAILED: price rejection had side effects';
 END IF;
 UPDATE public.products SET price=100 WHERE id=p;
 SELECT * INTO o FROM public.create_order(k,items,NULL,true,20,quote);
 IF o.total<>100 OR o.bonus_redeemed<>20 OR NOT o.reward_applied THEN RAISE EXCEPTION 'TEST_FAILED: accepted quote'; END IF;
 UPDATE public.products SET price=120 WHERE id=p;
 SELECT * INTO retry FROM public.create_order(k,items,NULL,true,20,quote);
 IF retry.id<>o.id OR retry.total<>100 THEN RAISE EXCEPTION 'TEST_FAILED: retry repriced original order'; END IF;
 BEGIN
  PERFORM * FROM public.create_order(k,items,NULL,true,20,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,2,120)),'payable',100));
  RAISE EXCEPTION 'TEST_FAILED: different quote reused key';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'IDEMPOTENCY_CONFLICT:%' THEN RAISE; END IF;
 END;
 items:=jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1));
 UPDATE public.products SET price=90 WHERE id=p;
 -- Equal payable amount is insufficient if individual unit prices differ.
 BEGIN
  PERFORM * FROM public.create_order(gen_random_uuid(),items,NULL,false,0,
   jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,100)),'payable',90));
  RAISE EXCEPTION 'TEST_FAILED: stale unit price accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'PRICE_CHANGED:%' THEN RAISE; END IF;
 END;
 quote:=jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,90)),'payable',0);
 BEGIN
  PERFORM * FROM public.create_order(gen_random_uuid(),items,NULL,true,0,quote);
  RAISE EXCEPTION 'TEST_FAILED: used gift charged full amount';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'PRICE_CHANGED:%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM * FROM public.create_order(gen_random_uuid(),items,NULL,false,0);
  RAISE EXCEPTION 'TEST_FAILED: unquoted checkout accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'QUOTE_REQUIRED:%' THEN RAISE; END IF;
 END;
 quote:=jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,90)),'payable',89);
 BEGIN
  PERFORM * FROM public.create_order(gen_random_uuid(),items,NULL,false,0,quote);
  RAISE EXCEPTION 'TEST_FAILED: wrong payable accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'PRICE_CHANGED:%' THEN RAISE; END IF;
 END;
 quote:=jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,90)),'payable',90);
 SELECT * INTO o FROM public.create_order(gen_random_uuid(),items,NULL,false,0,quote);
 IF o.total<>90 OR (SELECT count(*) FROM public.orders WHERE customer_id=u)<>2
 OR (SELECT balance FROM public.bonus_accounts WHERE customer_id=u)<>30
 OR (SELECT count(*) FROM public.bonus_transactions WHERE customer_id=u AND type='redeem')<>1 THEN
  RAISE EXCEPTION 'TEST_FAILED: quote acceptance or duplicate debit';
 END IF;
 IF has_function_privilege('anon','public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'TEST_FAILED: anonymous execute';
 END IF;
 RAISE NOTICE 'PASS: stale prices/payable rejected, no order/bonus/reward side effects, accepted quote, retry after repricing, changed-quote conflict, used gift, missing quote, one bonus debit';
END $$;
$suite_0$),
('02 completion, cancellation, refund and spent-point debt', $suite_1$
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
$suite_1$),
('03 stop-list, staff permission and retry after stop', $suite_2$
DO $$
DECLARE u uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); k uuid:=gen_random_uuid();
 items jsonb; quote jsonb; o record; retry record;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(s);
 INSERT INTO public.staff(user_id) VALUES(s);
 INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_visible)
 VALUES(p,-2100000501,'availability test','test',U&'\0414\0435\0441\0435\0440\0442\044B',100,true);
 INSERT INTO public.bonus_accounts(customer_id,balance) VALUES(u,20);
 INSERT INTO public.reward_entitlements(customer_id,streak_start_day,reward_cycle,earned_at,expires_at)
 VALUES(u,current_date-9,1,now(),now()+interval '720 hours');
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 BEGIN
  PERFORM public.set_product_availability(p,false,true);
  RAISE EXCEPTION 'TEST_FAILED: customer changed availability';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',s::text,true);
 PERFORM public.set_product_availability(p,false,true);
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p AND is_visible AND NOT is_available) THEN
  RAISE EXCEPTION 'TEST_FAILED: stop changes visibility';
 END IF;
 BEGIN
  PERFORM public.set_product_availability(p,true,true);
  RAISE EXCEPTION 'TEST_FAILED: stale staff toggle';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'AVAILABILITY_CHANGED:%' THEN RAISE; END IF;
 END;
 -- Catalog upsert does not overwrite the separately managed stop flag.
 INSERT INTO public.products(id,sbis_id,name,category,price) VALUES(p,-2100000501,'synced name','test',100)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price;
 IF (SELECT is_available FROM public.products WHERE id=p) THEN RAISE EXCEPTION 'TEST_FAILED: sync clears stop'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 items:=jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2));
 quote:=jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,2,100)),'payable',80);
 BEGIN
  PERFORM * FROM public.create_order(k,items,NULL,true,20,quote);
  RAISE EXCEPTION 'TEST_FAILED: stopped product ordered';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'PRODUCT_NOT_AVAILABLE:%' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.orders WHERE customer_id=u)
 OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE customer_id=u)
 OR (SELECT balance FROM public.bonus_accounts WHERE customer_id=u)<>20
 OR EXISTS(SELECT 1 FROM public.reward_entitlements WHERE customer_id=u AND redeemed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'TEST_FAILED: rejected checkout side effects';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',s::text,true);
 PERFORM public.set_product_availability(p,true,false);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 SELECT * INTO o FROM public.create_order(k,items,NULL,true,20,quote);
 PERFORM set_config('request.jwt.claim.sub',s::text,true);
 PERFORM public.set_product_availability(p,false,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 SELECT * INTO retry FROM public.create_order(k,items,NULL,true,20,quote);
 IF retry.id<>o.id THEN RAISE EXCEPTION 'TEST_FAILED: stop broke idempotent retry'; END IF;
 IF has_function_privilege('anon','public.set_product_availability(uuid,boolean,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'TEST_FAILED: anon toggle permission';
 END IF;
 RAISE NOTICE 'PASS: separate visibility/availability, staff guard, stale toggle, catalog preservation, stopped checkout without side effects, restore sales, retry after stop';
END $$;
$suite_2$),
('04 10/20/30-day rewards, consumption, expiry and client isolation', $suite_3$
DO $$
DECLARE
 u uuid := gen_random_uuid(); p uuid := gen_random_uuid(); k uuid:=gen_random_uuid();
 o record; retry record; d date := (clock_timestamp() AT TIME ZONE 'Asia/Tomsk')::date; n int;
 other_user uuid := gen_random_uuid(); historical_order uuid := gen_random_uuid(); snapshot jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO auth.users(id) VALUES(other_user);
 PERFORM set_config('reward.test.user',u::text,true);
 PERFORM set_config('reward.test.other',other_user::text,true);
 INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_visible)
 VALUES(p,-2147483600,'reward test','test','Десерты',100,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 SELECT * INTO o FROM public.create_order(gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,2,100)),'payable',200));
 IF o.reward_applied THEN RAISE EXCEPTION 'unearned reward'; END IF;
 FOR n IN 0..29 LOOP
  PERFORM public.reward_record_visit(u,d-29+n,clock_timestamp());
  PERFORM public.reward_record_visit(u,d-29+n,clock_timestamp());
 END LOOP;
 IF (SELECT count(*) FROM public.reward_entitlements WHERE customer_id=u)<>3 THEN RAISE EXCEPTION 'milestone duplicate'; END IF;
 SELECT * INTO o FROM public.create_order(k,jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,2,100)),'payable',100));
 IF NOT o.reward_applied OR o.reward_discount<>100 OR o.total<>100 THEN RAISE EXCEPTION 'discount'; END IF;
 SELECT * INTO retry FROM public.create_order(k,jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,2,100)),'payable',100));
 IF retry.id<>o.id THEN RAISE EXCEPTION 'retry'; END IF;
 IF (SELECT sum(quantity) FROM public.order_items WHERE order_id=o.id)<>2 THEN RAISE EXCEPTION 'quantity split'; END IF;
 UPDATE public.orders SET status='completed' WHERE id=o.id;
 UPDATE public.orders SET status='ready' WHERE id=o.id;
 UPDATE public.orders SET status='completed' WHERE id=o.id;
 UPDATE public.orders SET status='cancelled' WHERE id=o.id;
 BEGIN
  UPDATE public.orders SET status='completed' WHERE id=o.id;
  RAISE EXCEPTION 'cancelled order reopened';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'BONUS_CANCELLED_ORDER_FINAL%' THEN RAISE; END IF;
 END;
 IF (SELECT current_streak FROM public.reward_progress WHERE customer_id=u)<>30 THEN RAISE EXCEPTION 'repeat completion'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reward_entitlements WHERE redeemed_order_id=o.id) THEN RAISE EXCEPTION 'consumption'; END IF;
 SELECT * INTO o FROM public.create_order(gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,100)),'payable',0));
 IF NOT o.reward_applied THEN RAISE EXCEPTION 'second cycle unavailable'; END IF;
 SELECT * INTO o FROM public.create_order(gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,100)),'payable',0));
 IF NOT o.reward_applied THEN RAISE EXCEPTION 'third cycle unavailable'; END IF;
 SELECT * INTO o FROM public.create_order(gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,100)),'payable',100));
 IF o.reward_applied THEN RAISE EXCEPTION 'double spend'; END IF;
 FOR n IN 2..11 LOOP PERFORM public.reward_record_visit(u,d+n,clock_timestamp()-interval '721 hours'); END LOOP;
 IF (SELECT count(*) FROM public.reward_entitlements WHERE customer_id=u)<>4 THEN RAISE EXCEPTION 'new streak'; END IF;
 SELECT * INTO o FROM public.create_order(gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1)),NULL,true,0,jsonb_build_object('items',jsonb_build_array(jsonb_build_array(p,1,100)),'payable',100));
 IF o.reward_applied THEN RAISE EXCEPTION 'expired reward'; END IF;
 snapshot := public.get_loyalty_state();
 IF snapshot->>'customerId'<>u::text OR jsonb_array_length(snapshot->'rewards')<>4 THEN
  RAISE EXCEPTION 'snapshot identity/rewards';
 END IF;
 IF (snapshot->>'longestStreak')::int<>30 THEN RAISE EXCEPTION 'longest streak'; END IF;
 IF has_function_privilege('authenticated','public.reward_record_visit(uuid,date,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'helper exposed'; END IF;
 IF has_table_privilege('authenticated','public.reward_entitlements','INSERT') THEN RAISE EXCEPTION 'write exposed'; END IF;
 RAISE NOTICE 'PASS: unearned, 10/20/30-day gifts and continuous streak, same-day, discount/quantity, retry, repeat completion, consumption, double spend, new streak, expiry, privileges';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE snapshot jsonb;
BEGIN
 snapshot := public.get_loyalty_state();
 IF snapshot->>'customerId'<>current_setting('reward.test.user') THEN RAISE EXCEPTION 'authenticated snapshot'; END IF;
 IF EXISTS(SELECT 1 FROM public.reward_progress WHERE customer_id::text<>current_setting('reward.test.user')) THEN
  RAISE EXCEPTION 'RLS leaked progress';
 END IF;
 BEGIN
  INSERT INTO public.reward_progress(customer_id) VALUES(current_setting('reward.test.other')::uuid);
  RAISE EXCEPTION 'authenticated write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',current_setting('reward.test.other'),true);
 snapshot := public.get_loyalty_state();
 IF jsonb_array_length(snapshot->'rewards')<>0 THEN RAISE EXCEPTION 'cross-user rewards'; END IF;
 RAISE NOTICE 'PASS: authenticated snapshot, progress RLS, blocked writes, second-user isolation';
END $$;
RESET ROLE;
$suite_3$),
('05 sequential bonus rate threshold and exact reversals', $suite_4$
DO $$
DECLARE
 u uuid := gen_random_uuid();
 a uuid := gen_random_uuid();
 b uuid := gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.bonus_accounts(customer_id,lifetime_paid) VALUES(u,9990);
 INSERT INTO public.orders(id,customer_id,total,status)
 VALUES(a,u,20,'completed'),(b,u,20,'completed');
 IF NOT EXISTS (
  SELECT 1 FROM public.bonus_accounts
  WHERE customer_id=u AND balance=3 AND debt=0 AND lifetime_paid=10030
 ) OR (
  SELECT array_agg(amount ORDER BY amount)
  FROM public.bonus_transactions WHERE customer_id=u AND type='earn'
 ) IS DISTINCT FROM ARRAY[1,2] THEN
  RAISE EXCEPTION 'TEST_FAILED: sequential 5/10 percent threshold';
 END IF;
 UPDATE public.orders SET status='completed' WHERE id IN(a,b);
 UPDATE public.orders SET status='cancelled' WHERE id=a;
 UPDATE public.orders SET status='cancelled' WHERE id=b;
 UPDATE public.orders SET status='cancelled' WHERE id IN(a,b);
 IF NOT EXISTS (
  SELECT 1 FROM public.bonus_accounts
  WHERE customer_id=u AND balance=0 AND debt=0 AND lifetime_paid=9990
 ) OR (
  SELECT count(*) FROM public.bonus_transactions
  WHERE customer_id=u AND type='earn_reversal'
 )<>2 THEN
  RAISE EXCEPTION 'TEST_FAILED: threshold cancellation/repeat reversal';
 END IF;
END $$;
$suite_4$)
  ) AS s(test_name,sql_text)
 LOOP
  suite_ok := false;
  error_message := NULL;
  error_state := NULL;
  BEGIN
   EXECUTE suite.sql_text;
   suite_ok := true;
   -- Deliberately roll back the complete suite, including a successful run.
   RAISE EXCEPTION USING ERRCODE='ZB001', MESSAGE='SBL_TEST_FIXTURE_ROLLBACK';
  EXCEPTION
   WHEN SQLSTATE 'ZB001' THEN
    IF NOT suite_ok THEN
     error_state := 'ZB001';
     error_message := 'Unexpected test rollback marker';
    END IF;
   WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
     error_message = MESSAGE_TEXT,
     error_state = RETURNED_SQLSTATE;
  END;
  -- Role changes made by a suite are also undone by its subtransaction.
  IF current_user <> original_role THEN
   RAISE EXCEPTION 'Runner role was not restored after fixture rollback.';
  END IF;
  results := results || jsonb_build_array(jsonb_build_object(
   'test',suite.test_name,
   'result',CASE WHEN suite_ok THEN 'PASS' ELSE 'FAIL' END,
   'details',CASE WHEN suite_ok THEN 'Assertions passed; fixture writes rolled back'
    ELSE coalesce(error_state,'UNKNOWN') || ': ' || coalesce(error_message,'Unknown error') END
  ));
 END LOOP;

 SELECT jsonb_build_object(
 'users',(SELECT count(*) FROM auth.users),
 'products',(SELECT count(*) FROM public.products),
 'orders',(SELECT count(*) FROM public.orders),
 'items',(SELECT count(*) FROM public.order_items),
 'accounts',(SELECT count(*) FROM public.bonus_accounts),
 'transactions',(SELECT count(*) FROM public.bonus_transactions),
 'progress',(SELECT count(*) FROM public.reward_progress),
 'rewards',(SELECT count(*) FROM public.reward_entitlements),
 'staff',(SELECT count(*) FROM public.staff)
) INTO after_counts;
 results := results || jsonb_build_array(jsonb_build_object(
  'test','06 fixture cleanup: original row counts restored',
  'result',CASE WHEN before_counts=after_counts THEN 'PASS' ELSE 'FAIL' END,
  'details',CASE WHEN before_counts=after_counts THEN 'Users, products, orders, items, bonuses, rewards and staff counts unchanged'
   ELSE jsonb_build_object('before',before_counts,'after',after_counts)::text END
 ));
 PERFORM set_config('sbl_audit.behavior_results',results::text,true);
END;
$runner$;

SELECT test,result,details
FROM jsonb_to_recordset(current_setting('sbl_audit.behavior_results')::jsonb)
 AS r(test text,result text,details text)
ORDER BY test;

ROLLBACK;
