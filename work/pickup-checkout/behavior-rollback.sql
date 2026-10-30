-- Run the WHOLE file as postgres, after the new migration, against a test DB.
-- All fixture data and the deterministic private clock replacement roll back.
-- No real product/customer row is updated. Sequence increments do not roll back.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='3s';
SET LOCAL sbl.test_now='2026-10-29T05:00:00Z';
CREATE OR REPLACE FUNCTION public.pickup_order_clock() RETURNS timestamptz
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT current_setting('sbl.test_now')::timestamptz;
$$;
CREATE TEMP TABLE pickup_test_results(test text,result text);
CREATE FUNCTION pg_temp.pickup_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST_FAILED: %',label; END IF;
 INSERT INTO pickup_test_results VALUES(label,'PASS');
END $$;
CREATE FUNCTION pg_temp.pickup_expect_error(query text,prefix text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query;
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE prefix||'%' THEN RAISE; END IF;
  INSERT INTO pickup_test_results VALUES(label,'PASS'); RETURN;
 END;
 RAISE EXCEPTION 'TEST_FAILED: expected % for %',prefix,label;
END $$;

DO $tests$
DECLARE
 u uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 m uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); hidden uuid:=gen_random_uuid(); key1 uuid:=gen_random_uuid(); key2 uuid:=gen_random_uuid();
 items jsonb; quote jsonb; contact jsonb:=jsonb_build_object('customer_id',u,'name',' Test Customer ','phone','+79990000001','comment','No sugar');
 fulfillment jsonb:=jsonb_build_object('point_id','lenina-72','pickup_at',NULL); v_line_key text;
 o public.orders%ROWTYPE; retry record; variants public.orders%ROWTYPE; gift public.orders%ROWTYPE;
 paid timestamptz; journal_count bigint; cfg jsonb; sample record; n_before bigint; expected_mods jsonb;
 note_items jsonb; note_quote jsonb; note_key uuid:=gen_random_uuid(); note_one text:=E'ваниль\nбез корицы';
BEGIN
 IF current_user<>'postgres' OR to_regprocedure('public.create_pickup_order(uuid,jsonb,text,boolean,numeric,jsonb,jsonb,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'TEST_SCHEMA_REQUIRED: run as postgres after pickup migration'; END IF;
 PERFORM pg_advisory_xact_lock(291020261000::bigint);
 INSERT INTO auth.users(id) VALUES(u),(s);
 INSERT INTO public.staff(user_id) VALUES(s);
 INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_visible,is_available,is_modifier)
 VALUES(b,-2140000101,'fixture base','fixture','Напитки',100,true,true,false),
 (d,-2140000102,'fixture dessert','fixture','Десерты',100,true,true,false),
 (m,-2140000103,'fixture hidden modifier','fixture',NULL,10,false,true,true),
 (hidden,-2140000104,'fixture hidden base','fixture','Еда',10,false,true,false),
 (m2,-2140000105,'fixture second modifier','fixture',NULL,5,true,true,true);
 INSERT INTO public.bonus_accounts(customer_id,balance) VALUES(u,30);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM pg_temp.pickup_assert(EXISTS(SELECT 1 FROM public.get_ordering_catalog() WHERE id=m)
  AND NOT EXISTS(SELECT 1 FROM public.get_ordering_catalog() WHERE id=hidden),
  '01 catalog exposes available hidden modifiers but hides unpublished bases');
 PERFORM pg_temp.pickup_assert(has_function_privilege('anon','public.get_ordering_catalog()','execute')
  AND has_function_privilege('anon','public.get_ordering_config()','execute'),
  '02 catalog and config are publicly readable');
 FOR sample IN SELECT * FROM (VALUES
  ('2026-10-29T03:59:59Z',false),('2026-10-29T04:00:00Z',true),
  ('2026-10-29T12:55:00Z',true),('2026-10-29T12:55:00.001Z',false),('2026-10-29T13:00:00Z',false)
 ) x(at_time,expected) LOOP
  PERFORM set_config('sbl.test_now',sample.at_time,true); cfg:=public.get_ordering_config();
  PERFORM pg_temp.pickup_assert((cfg->>'is_open')::boolean=sample.expected,
   '03 acceptance window boundary '||sample.at_time);
 END LOOP;
 PERFORM pg_temp.pickup_assert((cfg->>'next_open_at')::timestamptz='2026-10-30T04:00:00Z',
  '04 next opening uses the next Tomsk calendar day');
 PERFORM set_config('sbl.test_now','2026-10-29T05:00:00Z',true);
 v_line_key:=b::text||'|'||m::text||'x2';
 items:=jsonb_build_array(jsonb_build_object('product_id',b,'quantity',2,'modifiers',
  jsonb_build_array(jsonb_build_object('product_id',m,'quantity',2))));
 quote:=jsonb_build_object('version',2,'items',jsonb_build_array(jsonb_build_array(v_line_key,b,2,100,
  jsonb_build_array(jsonb_build_array(m,2,10)))),'payable',220);
 SELECT * INTO o FROM public.create_pickup_order(key1,items,NULL,false,20,quote,contact,fulfillment);
 PERFORM pg_temp.pickup_assert(o.total=240 AND o.subtotal=240 AND o.bonus_redeemed=20
  AND o.customer_name='Test Customer' AND o.customer_phone='+79990000001' AND o.comment='No sugar'
  AND o.pickup_at='2026-10-29T05:05:00Z' AND o.payment_method='on_pickup' AND o.paid_at IS NULL,
  '05 modifiers multiply per parent, money total precedes bonus debit, contact and ASAP persist');
 PERFORM pg_temp.pickup_assert(EXISTS(SELECT 1 FROM public.order_items WHERE order_id=o.id AND quantity=2
  AND price=120 AND base_unit_price=100 AND order_items.line_key=v_line_key
  AND modifiers->0->>'name'='fixture hidden modifier' AND (modifiers->0->>'quantity')::int=2
  AND (modifiers->0->>'unit_price')::numeric=10),
  '06 base and modifier snapshots are authoritative');
 PERFORM pg_temp.pickup_assert((SELECT balance FROM public.bonus_accounts WHERE customer_id=u)=10
  AND (SELECT count(*) FROM public.bonus_transactions WHERE order_id=o.id AND type='redeem')=1,
  '07 exactly one 20 point debit');
 SELECT * INTO retry FROM public.get_order_by_idempotency_key(key1);
 PERFORM pg_temp.pickup_assert(retry.id=o.id,'08 existing recovery lookup still returns own v2 order');
 UPDATE public.products SET price=999,is_available=false WHERE id IN(b,m);
 PERFORM set_config('sbl.test_now','2026-10-29T13:00:00Z',true);
 SELECT * INTO retry FROM public.create_pickup_order(key1,items,NULL,false,20,quote,contact,fulfillment);
 PERFORM pg_temp.pickup_assert(retry.id=o.id AND retry.total=240
  AND (SELECT balance FROM public.bonus_accounts WHERE customer_id=u)=10,
  '09 retry survives closing, price change and stop list without a second debit');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,20,%L::jsonb,%L::jsonb,%L::jsonb)',
  key1,items,quote,contact||jsonb_build_object('comment','changed'),fulfillment),
  'IDEMPOTENCY_CONFLICT:','10 changed contact cannot reuse an existing idempotency key');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,20,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,fulfillment),'CAFE_CLOSED:','11 a new request after closing is rejected');
 UPDATE public.products SET price=CASE WHEN id=m THEN 10 ELSE 100 END,is_available=true WHERE id IN(b,m);
 PERFORM set_config('sbl.test_now','2026-10-29T05:00:00Z',true);
 -- Same base with different modifiers is two lines, not one merged product.
 items:=jsonb_build_array(jsonb_build_object('product_id',b,'quantity',1,'modifiers','[]'::jsonb),
  jsonb_build_object('product_id',b,'quantity',1,'modifiers',jsonb_build_array(jsonb_build_object('product_id',m,'quantity',2))));
 quote:=jsonb_build_object('version',2,'items',jsonb_build_array(jsonb_build_array(b::text,b,1,100,'[]'::jsonb),
  jsonb_build_array(v_line_key,b,1,100,jsonb_build_array(jsonb_build_array(m,2,10)))),'payable',220);
 SELECT * INTO variants FROM public.create_pickup_order(key2,items,NULL,false,0,quote,contact,fulfillment);
 PERFORM pg_temp.pickup_assert(variants.total=220 AND (SELECT count(*) FROM public.order_items WHERE order_id=variants.id)=2,
  '12 different modifier variants remain separate order lines');
 -- Two raw duplicate variant lines, reversed modifier order and whole 1.0 JSON
 -- quantities must produce one sorted, aggregated line of two 115-unit items.
 SELECT jsonb_agg(jsonb_build_array(id,1,price) ORDER BY id) INTO expected_mods
 FROM (VALUES(m,10),(m2,5)) expected(id,price);
 v_line_key:=b::text||CASE WHEN m<m2 THEN '|'||m::text||'x1|'||m2::text||'x1'
  ELSE '|'||m2::text||'x1|'||m::text||'x1' END;
 SELECT * INTO retry FROM public.create_pickup_order(gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('product_id',b,'quantity','1.0'::jsonb,'modifiers',jsonb_build_array(
   jsonb_build_object('product_id',m2,'quantity','1.0'::jsonb),jsonb_build_object('product_id',m,'quantity',1))),
  jsonb_build_object('product_id',b,'quantity',1,'modifiers',jsonb_build_array(
   jsonb_build_object('product_id',m,'quantity',1),jsonb_build_object('product_id',m2,'quantity',1)))),
  NULL,false,0,jsonb_build_object('version',2,'items',jsonb_build_array(jsonb_build_array(v_line_key,b,2,100,expected_mods)),
  'payable',230),contact,fulfillment);
 PERFORM pg_temp.pickup_assert(retry.total=230 AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=retry.id
  AND i.quantity=2 AND i.price=115 AND i.line_key=v_line_key)
  AND (SELECT count(*) FROM public.order_items WHERE order_id=retry.id)=1,
  '12b canonical sorting, whole decimal quantities and duplicate variant aggregation');
 note_items:=jsonb_build_array(jsonb_build_object('product_id',b,'quantity',1,'preparation_note',E' \tваниль\r\nбез корицы \r\n ',
  'modifiers',jsonb_build_array(jsonb_build_object('product_id',m,'quantity',2))),
  jsonb_build_object('product_id',b,'quantity',1,'preparation_note','карамель',
  'modifiers',jsonb_build_array(jsonb_build_object('product_id',m,'quantity',2))));
 SELECT jsonb_build_object('version',2,'items',jsonb_agg(jsonb_build_array(k,b,1,100,
  jsonb_build_array(jsonb_build_array(m,2,10))) ORDER BY k COLLATE "C"),'payable',240) INTO note_quote
 FROM (VALUES(b::text||'|'||m::text||'x2|note:'||note_one),(b::text||'|'||m::text||'x2|note:карамель')) expected(k);
 SELECT * INTO retry FROM public.create_pickup_order(note_key,note_items,NULL,false,0,note_quote,contact,fulfillment);
 PERFORM pg_temp.pickup_assert(retry.total=240 AND (SELECT count(*) FROM public.order_items i WHERE i.order_id=retry.id)=2
  AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=retry.id AND i.preparation_note=note_one AND i.price=120)
  AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=retry.id AND i.preparation_note='карамель' AND i.price=120),
  '12c different syrup notes stay separate, normalize whitespace, and never change modifier prices');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  note_key,jsonb_set(note_items,'{0,preparation_note}',to_jsonb('шоколад'::text)),note_quote,contact,fulfillment),
  'IDEMPOTENCY_CONFLICT:','12d a different preparation note cannot reuse an idempotency key');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),jsonb_set(note_items,'{0,preparation_note}',to_jsonb(repeat('я',201))),note_quote,contact,fulfillment),
  'INVALID_PREPARATION_NOTE:','12e preparation notes are limited to two hundred Unicode characters');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),jsonb_set(note_items,'{0,preparation_note}',to_jsonb(E'ваниль\tещё'::text)),note_quote,contact,fulfillment),
  'INVALID_PREPARATION_NOTE:','12f interior controls are rejected while line feed remains supported');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact||jsonb_build_object('phone','89990000001'),fulfillment),
  'INVALID_CONTACT:','13 contact requires a normalized Russian +7 phone');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact||jsonb_build_object('customer_id',s),fulfillment),
  'SESSION_CHANGED:','13b a checkout prepared by another user cannot use the current session');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact||jsonb_build_object('name',''),fulfillment),
  'INVALID_CONTACT:','14 blank contact name is rejected');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact||jsonb_build_object('comment',repeat('x',501)),fulfillment),
  'INVALID_CONTACT:','15 oversized comment is rejected');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,jsonb_build_object('point_id','other','pickup_at',NULL)),
  'INVALID_PICKUP:','16 unknown pickup point is rejected');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,fulfillment||jsonb_build_object('pickup_at','2026-10-29T05:03:00Z')),
  'INVALID_PICKUP:','17 scheduled pickup cannot precede preparation');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,fulfillment||jsonb_build_object('pickup_at','2026-10-29T13:00:01Z')),
  'INVALID_PICKUP:','18 scheduled pickup cannot exceed closing');
 UPDATE auth.users SET phone='79990000002',phone_confirmed_at=clock_timestamp() WHERE id=u;
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,fulfillment),'CONTACT_PHONE_MISMATCH:','19 verified account phone cannot be replaced by a guest contact');
 UPDATE auth.users SET phone=NULL,phone_confirmed_at=NULL WHERE id=u;
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',b,'quantity',1.5)),quote,contact,fulfillment),
  'INVALID_QUANTITY:','20 fractional parent quantity is rejected');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',b,'quantity',1,'modifiers',
   jsonb_build_array(jsonb_build_object('product_id',m,'quantity',11)))),quote,contact,fulfillment),
  'INVALID_QUANTITY:','21 modifier quantity over ten is rejected');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',b,'quantity',1,'modifiers',
   (SELECT jsonb_agg(jsonb_build_object('product_id',gen_random_uuid(),'quantity',1)) FROM generate_series(1,21)))),quote,contact,fulfillment),
  'INVALID_QUANTITY:','21b more than twenty distinct modifiers is rejected');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',b,'quantity',1,'modifiers',jsonb_build_array(
   jsonb_build_object('product_id',m,'quantity',6),jsonb_build_object('product_id',m,'quantity',5)))),quote,contact,fulfillment),
  'INVALID_QUANTITY:','21c duplicate modifier rows cannot bypass the per-unit quantity limit');
 UPDATE public.products SET price=11 WHERE id=m;
 SELECT count(*) INTO n_before FROM public.orders WHERE customer_id=u;
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,fulfillment),'PRICE_CHANGED:','22 stale modifier price is rejected');
 PERFORM pg_temp.pickup_assert((SELECT count(*) FROM public.orders WHERE customer_id=u)=n_before,
  '23 a rejected quote creates no partial order');
 UPDATE public.products SET price=10 WHERE id=m;
 UPDATE public.products SET is_available=false WHERE id=m;
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.create_pickup_order(%L,%L::jsonb,NULL,false,0,%L::jsonb,%L::jsonb,%L::jsonb)',
  gen_random_uuid(),items,quote,contact,fulfillment),'PRODUCT_NOT_AVAILABLE:','24 stopped modifier is rejected');
 UPDATE public.products SET is_available=true WHERE id=m;
 -- Gift: two 100 base + 20 addon units, one base gifted, 10% of remaining 140.
 INSERT INTO public.reward_entitlements(customer_id,streak_start_day,reward_cycle,earned_at,expires_at)
 VALUES(u,current_date-9,1,clock_timestamp(),clock_timestamp()+interval '30 days');
 v_line_key:=d::text||'|'||m::text||'x2';
 items:=jsonb_build_array(jsonb_build_object('product_id',d,'quantity',2,'modifiers',
  jsonb_build_array(jsonb_build_object('product_id',m,'quantity',2))));
 quote:=jsonb_build_object('version',2,'items',jsonb_build_array(jsonb_build_array(v_line_key,d,2,100,
  jsonb_build_array(jsonb_build_array(m,2,10)))),'payable',126);
 SELECT * INTO gift FROM public.create_pickup_order(gen_random_uuid(),items,'SBL10',true,0,quote,contact,fulfillment);
 PERFORM pg_temp.pickup_assert(gift.subtotal=240 AND gift.reward_discount=100 AND gift.discount_total=14 AND gift.total=126,
  '25 gift removes one base, promotion applies to the remaining charged amount');
 PERFORM pg_temp.pickup_assert((SELECT count(*) FROM public.order_items WHERE order_id=gift.id)=2
  AND EXISTS(SELECT 1 FROM public.order_items WHERE order_id=gift.id AND quantity=1 AND price=20 AND base_unit_price=100)
  AND EXISTS(SELECT 1 FROM public.order_items WHERE order_id=gift.id AND quantity=1 AND price=120 AND base_unit_price=100)
  AND (SELECT count(DISTINCT order_items.line_key) FROM public.order_items WHERE order_id=gift.id)=1,
  '26 gifted unit still charges modifiers and preserves a repeatable base snapshot');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.update_order_status(%L,%L,true,false)',gift.id,'completed'),
  'STAFF_REQUIRED','27 customer cannot perform a staff status change');
 PERFORM set_config('request.jwt.claim.sub',s::text,true);
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.update_order_status(%L,%L,true,false)',gift.id,'completed'),
  'INVALID_STATUS_TRANSITION:','28 a new order cannot jump directly to completed');
 PERFORM * FROM public.update_order_status(gift.id,'preparing');
 PERFORM * FROM public.update_order_status(gift.id,'ready');
 PERFORM pg_temp.pickup_expect_error(format('SELECT * FROM public.update_order_status(%L,%L,false,false)',gift.id,'completed'),
  'PAYMENT_CONFIRMATION_REQUIRED:','29 handover requires explicit payment confirmation');
 SELECT * INTO gift FROM public.update_order_status(gift.id,'completed',true,false);
 paid:=gift.paid_at;
 PERFORM pg_temp.pickup_assert(paid IS NOT NULL AND gift.manual_sale_recorded_at IS NULL AND gift.bonus_earned=6,
  '30 payment and completion settle the existing bonus mechanism exactly once');
 SELECT count(*) INTO journal_count FROM public.bonus_transactions WHERE order_id=gift.id;
 SELECT * INTO retry FROM public.update_order_status(gift.id,'completed',true,true);
 PERFORM pg_temp.pickup_assert(retry.paid_at=paid AND retry.manual_sale_recorded_at IS NOT NULL
  AND (SELECT count(*) FROM public.bonus_transactions WHERE order_id=gift.id)=journal_count,
  '31 later Saby confirmation preserves original payment and creates no duplicate earnings');
 PERFORM * FROM public.update_order_status(gift.id,'cancelled');
 PERFORM * FROM public.update_order_status(gift.id,'cancelled');
 PERFORM pg_temp.pickup_assert((SELECT balance FROM public.bonus_accounts WHERE customer_id=u)=10
  AND (SELECT count(*) FROM public.bonus_transactions WHERE order_id=gift.id AND type='earn_reversal')=1,
  '32 repeated cancellation reverses earnings once');
 PERFORM * FROM public.update_order_status(o.id,'cancelled');
 PERFORM pg_temp.pickup_assert((SELECT balance FROM public.bonus_accounts WHERE customer_id=u)=30
  AND (SELECT count(*) FROM public.bonus_transactions WHERE order_id=o.id AND type='refund')=1,
  '33 cancellation refunds the original bonus debit once');
 PERFORM pg_temp.pickup_assert(NOT has_function_privilege('authenticated','public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)','execute')
  AND NOT has_function_privilege('service_role','public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)','execute'),
  '34 legacy checkout cannot bypass contact and hours through API roles');
 PERFORM pg_temp.pickup_assert(NOT has_table_privilege('authenticated','public.orders','UPDATE')
  AND NOT has_table_privilege('authenticated','public.order_items','INSERT'),
  '35 direct staff and customer mutation privileges are removed');
 PERFORM set_config('role','authenticated',true);
 BEGIN UPDATE public.orders SET status='completed' WHERE id=variants.id;
  RAISE EXCEPTION 'TEST_FAILED: direct staff update succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('role','postgres',true);
 PERFORM pg_temp.pickup_assert(true,'36 actual direct authenticated staff update is denied');
END $tests$;

SELECT test,result FROM pickup_test_results ORDER BY test;
ROLLBACK;
