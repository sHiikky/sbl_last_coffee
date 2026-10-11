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
ROLLBACK;
