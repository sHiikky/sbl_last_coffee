BEGIN;
SET LOCAL statement_timeout='40s';
DO $$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>5543 OR current_database() NOT LIKE 'sbl_promo_test_%' THEN RAISE EXCEPTION 'LOCAL_TEST_DATABASE_REQUIRED'; END IF; END $$;
CREATE TEMP TABLE promo_checks(test text,result text);
GRANT INSERT,SELECT ON promo_checks TO authenticated,anon;
CREATE FUNCTION pg_temp.check_promo(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO promo_checks VALUES(label,'PASS'); END $$;
CREATE FUNCTION pg_temp.expect_promo_error(query text,prefix text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE prefix||'%' THEN RAISE; END IF; INSERT INTO promo_checks VALUES(label,'PASS'); RETURN; END; RAISE EXCEPTION 'FAIL: expected % for %',prefix,label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check_promo(boolean,text),pg_temp.expect_promo_error(text,text,text) TO authenticated,anon;
INSERT INTO auth.users(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.staff VALUES('22222222-2222-4222-8222-222222222222');
INSERT INTO public.products(id,name,category,menu_category,price,is_modifier,is_available,is_visible,raw_payload) VALUES
 ('33333333-3333-4333-8333-333333333333','Латте','Кофе','Напитки',100,false,true,true,'{}'),
 ('44444444-4444-4444-8444-444444444444','Десерт','Еда','Десерты',200,false,true,true,'{}'),
 ('55555555-5555-4555-8555-555555555555','Сироп','Добавки','Напитки',30,true,true,false,'{}');
SELECT pg_temp.check_promo(NOT has_table_privilege('authenticated','public.app_promo_codes','SELECT'),'01 codes are not publicly enumerable');
SELECT pg_temp.check_promo(NOT has_function_privilege('anon','public.quote_app_promo(text,jsonb,text,numeric)','EXECUTE') AND NOT has_function_privilege('authenticated','public.app_promo_discount(text,jsonb,numeric,text,numeric)','EXECUTE'),'02 private helpers and anonymous access closed');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.expect_promo_error('SELECT public.staff_list_app_promos()','STAFF_REQUIRED','03 customer cannot list codes');
SELECT pg_temp.expect_promo_error('SELECT public.staff_save_app_promo(gen_random_uuid(),0,''{}'')','STAFF_REQUIRED','04 customer cannot change codes');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$ DECLARE p jsonb:='{"code":"TEST20","name":"Test","discount_type":"percent","discount_value":20,"min_order":100,"max_order":300,"max_discount":40,"scope":"all","product_ids":[],"categories":[],"active":true}'; r jsonb; id uuid:='66666666-6666-4666-8666-666666666666'; BEGIN
 r:=public.staff_save_app_promo(id,0,p);
 PERFORM pg_temp.check_promo(r->>'version'='1','05 staff creates promotion');
 PERFORM pg_temp.check_promo(public.staff_save_app_promo(id,0,p)=r,'06 lost response retry does not duplicate promotion');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.staff_save_app_promo(%L,0,%L)',id,(p||'{"name":"other"}')::text),'PROMO_CONFLICT','07 concurrent edits cannot overwrite');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.staff_save_app_promo(%L,1,%L)',id,(p||'{"discount_value":101}')::text),'INVALID_PROMO','08 percent above 100 rejected');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.staff_save_app_promo(%L,1,%L)',id,(p||'{"max_order":99}')::text),'INVALID_PROMO','09 inverted order amount range rejected');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.staff_save_app_promo(%L,1,%L)',id,(p||'{"scope":"products"}')::text),'INVALID_PROMO_SCOPE','10 empty selected products rejected');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.staff_save_app_promo(%L,1,%L)',id,(p||'{"starts_at":"2030-01-02","ends_at":"2030-01-01"}')::text),'INVALID_PROMO','11 inverted dates rejected');
 END $$;
RESET ROLE;
DO $$ DECLARE priced jsonb:='[{"product_id":"33333333-3333-4333-8333-333333333333","line_key":"coffee","quantity":1,"unit_price":100,"menu_category":"Напитки"},{"product_id":"44444444-4444-4444-8444-444444444444","line_key":"dessert","quantity":1,"unit_price":200,"menu_category":"Десерты"}]'; BEGIN
 PERFORM pg_temp.check_promo(public.app_promo_discount('TEST20',priced,300,NULL,0)=40,'12 percentage discount capped at 40');
 PERFORM pg_temp.check_promo(public.app_promo_discount('TEST20',priced,300,'dessert',200)=20,'13 reward free base excluded from promo');
 PERFORM pg_temp.check_promo(public.app_promo_discount('TEST20',priced->0||'[]'::jsonb,100,NULL,0)=20,'14 minimum and maximum thresholds inclusive');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.app_promo_discount(''TEST20'',%L,99,NULL,0)',priced::text),'PROMO_NOT_APPLICABLE','15 amount below minimum rejected');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.app_promo_discount(''TEST20'',%L,301,NULL,0)',priced::text),'PROMO_NOT_APPLICABLE','16 amount above maximum rejected');
 UPDATE public.app_promo_codes SET scope='categories',categories=ARRAY['Напитки'] WHERE code='TEST20';
 PERFORM pg_temp.check_promo(public.app_promo_discount('TEST20',priced,300,NULL,0)=20,'17 category selection excludes dessert');
 UPDATE public.app_promo_codes SET scope='products',product_ids=ARRAY['44444444-4444-4444-8444-444444444444'::uuid],discount_type='fixed',discount_value=500,max_discount=NULL WHERE code='TEST20';
 PERFORM pg_temp.check_promo(public.app_promo_discount('TEST20',priced,300,NULL,0)=200,'18 fixed discount limited to eligible product amount');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.app_promo_discount(''TEST20'',%L,300,''dessert'',200)',priced::text),'PROMO_NOT_APPLICABLE','19 gifted selected product cannot yield extra discount');
 UPDATE public.app_promo_codes SET active=false WHERE code='TEST20';
 PERFORM pg_temp.expect_promo_error(format('SELECT public.app_promo_discount(''TEST20'',%L,300,NULL,0)',priced::text),'PROMO_INVALID','20 disabled code rejected');
 UPDATE public.app_promo_codes SET active=true,ends_at=clock_timestamp()-interval '1 minute' WHERE code='TEST20';
 PERFORM pg_temp.expect_promo_error(format('SELECT public.app_promo_discount(''TEST20'',%L,300,NULL,0)',priced::text),'PROMO_INVALID','21 expired code rejected');
 UPDATE public.app_promo_codes SET ends_at=NULL,starts_at=clock_timestamp()+interval '1 day' WHERE code='TEST20';
 PERFORM pg_temp.expect_promo_error(format('SELECT public.app_promo_discount(''TEST20'',%L,300,NULL,0)',priced::text),'PROMO_INVALID','22 scheduled code unavailable before start');
 UPDATE public.app_promo_codes SET starts_at=NULL,scope='all',discount_type='percent',discount_value=20 WHERE code='TEST20';
 END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.check_promo(public.quote_app_promo('test20','[{"product_id":"33333333-3333-4333-8333-333333333333","quantity":1,"line_key":"coffee","unit_price":1,"modifiers":[{"product_id":"55555555-5555-4555-8555-555555555555","quantity":1}]}]')->>'discount'='26.00','23 quote reads actual prices and includes addons, ignores forged client price');
RESET ROLE;
CREATE OR REPLACE FUNCTION public.pickup_order_clock() RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT '2026-11-06 12:00:00+07'::timestamptz; $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r public.orders; again public.orders; key uuid:=gen_random_uuid(); items jsonb:='[{"product_id":"33333333-3333-4333-8333-333333333333","quantity":1}]'; quote jsonb:='{"version":2,"items":[["33333333-3333-4333-8333-333333333333","33333333-3333-4333-8333-333333333333",1,100,[]]],"payable":80}'; contact jsonb:='{"name":"Test","phone":"+79990000000","customer_id":"11111111-1111-4111-8111-111111111111"}'; BEGIN
 SELECT * INTO r FROM public.create_pickup_order(key,items,'TEST20',false,0,quote,contact,'{"point_id":"lenina-72"}');
 PERFORM pg_temp.check_promo(r.total=80 AND r.discount_total=20 AND r.promo_code='TEST20','24 real checkout uses dynamic promotion');
 SELECT * INTO again FROM public.create_pickup_order(key,items,'TEST20',false,0,quote,contact,'{"point_id":"lenina-72"}');
 PERFORM pg_temp.check_promo(again.id=r.id,'25 checkout idempotency preserved');
 PERFORM pg_temp.expect_promo_error(format('SELECT public.create_pickup_order(gen_random_uuid(),%L,''TEST20'',false,0,%L,%L,''{"point_id":"lenina-72"}'')',items::text,(quote||'{"payable":70}')::text,contact::text),'PRICE_CHANGED','26 forged client discount rejected');
 END $$;
RESET ROLE;
SELECT pg_temp.check_promo((SELECT count(*)=1 FROM public.orders),'27 rejected checkout creates no partial order');
SELECT * FROM promo_checks ORDER BY test;
ROLLBACK;