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
 -- Simulate an order which was completed before this migration.
 ALTER TABLE public.orders DISABLE TRIGGER orders_00_reward_before;
 INSERT INTO public.orders(id,customer_id,status,total) VALUES(historical_order,other_user,'completed',100);
 ALTER TABLE public.orders ENABLE TRIGGER orders_00_reward_before;
 UPDATE public.orders SET updated_at=clock_timestamp() WHERE id=historical_order;
 IF EXISTS(SELECT 1 FROM public.orders WHERE id=historical_order AND loyalty_qualified_at IS NOT NULL) THEN
  RAISE EXCEPTION 'historical metadata update earned a visit';
 END IF;
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
ROLLBACK;
