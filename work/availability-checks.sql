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
ROLLBACK;
