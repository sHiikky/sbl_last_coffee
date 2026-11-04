BEGIN;
SET LOCAL statement_timeout='40s';
DO $$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>5543
 OR current_database() NOT LIKE 'sbl_catalog_test_%' THEN RAISE EXCEPTION 'LOCAL_TEST_DATABASE_REQUIRED'; END IF; END $$;
CREATE TEMP TABLE catalog_checks(test text,result text);
GRANT INSERT,SELECT ON catalog_checks TO authenticated,anon;
CREATE FUNCTION pg_temp.catalog_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO catalog_checks VALUES(label,'PASS'); END $$;
CREATE FUNCTION pg_temp.catalog_error(query text,prefix text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE prefix||'%' THEN RAISE; END IF;
 INSERT INTO catalog_checks VALUES(label,'PASS'); RETURN; END; RAISE EXCEPTION 'FAIL: expected % for %',prefix,label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.catalog_assert(boolean,text),pg_temp.catalog_error(text,text,text) TO anon,authenticated;
INSERT INTO auth.users(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.staff VALUES('22222222-2222-4222-8222-222222222222');
INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_modifier,is_available,raw_payload)
 VALUES('33333333-3333-4333-8333-333333333333',-1001,'Сироп 10 мл','Добавки','Напитки',30,true,true,'{}'),
 ('44444444-4444-4444-8444-444444444444',-1002,'Молоко','Добавки','Напитки',50,true,true,'{}'),
 ('55555555-5555-4555-8555-555555555555',-1003,'СБИС товар','Кофе','Напитки',200,false,true,'{"cost":200}');
SET LOCAL ROLE anon;
SELECT pg_temp.catalog_assert(NOT has_function_privilege('anon','public.staff_save_catalog_product(uuid,integer,jsonb)','EXECUTE'),'01 anon cannot execute editor RPC');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.catalog_error('SELECT public.staff_list_catalog_products()','STAFF_REQUIRED','02 customer cannot list staff catalog');
SELECT pg_temp.catalog_error($q$SELECT public.staff_save_catalog_product(gen_random_uuid(),0,'{}')$q$,'STAFF_REQUIRED','03 customer cannot save product');
SELECT pg_temp.catalog_assert(NOT has_table_privilege('authenticated','public.products','UPDATE') AND NOT has_table_privilege('authenticated','public.products','INSERT'),'04 direct customer product writes closed');
SELECT pg_temp.catalog_assert(NOT has_table_privilege('authenticated','public.product_catalog_edits','SELECT'),'05 private retry receipts inaccessible');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$ DECLARE
 id uuid:='66666666-6666-4666-8666-666666666666'; p jsonb; saved jsonb; again jsonb;
BEGIN
 p:=jsonb_build_object('name','Тестовый латте','description','Описание','ingredients','Кофе, молоко','allergens','Молоко',
  'size_label','300 мл','menu_category','Напитки','menu_subcategory','Авторский кофе','price',350,'price_mode','manual',
  'nutrition','{"calories":123,"protein":0,"fat":4.5,"carbs":12}'::jsonb,'nutrition_basis','portion',
  'image_url',NULL,'is_visible',false,'is_available',true,'is_modifier',false,'is_quick_pick',true,'badge','Новинка','sort_order',3,
  'allowed_modifier_ids',jsonb_build_array('33333333-3333-4333-8333-333333333333'));
 saved:=public.staff_save_catalog_product(id,0,p);
 PERFORM pg_temp.catalog_assert(saved->>'sbis_id' IS NULL AND (saved->>'catalog_version')::int=1,'06 create manual product without fake SBIS ID');
 PERFORM pg_temp.catalog_assert(NOT EXISTS(SELECT 1 FROM public.get_ordering_catalog() c WHERE c.id='66666666-6666-4666-8666-666666666666'),'07 hidden draft excluded from app catalog');
 again:=public.staff_save_catalog_product(id,0,p);
 PERFORM pg_temp.catalog_assert(again=saved,'08 uncertain create retry returns same UUID and version');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,1,%L)',id,(p||'{"is_visible":true}')::text),'CATALOG_PHOTO_REQUIRED','09 publish requires photo');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,1,%L)',id,(p||'{"price":-1}')::text),'INVALID_CATALOG_PRICE','10 negative price rejected');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,1,%L)',id,(p||'{"nutrition":{"fat":-1}}')::text),'INVALID_CATALOG_NUTRITION','11 invalid nutrition rejected');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,1,%L)',id,(p||'{"allowed_modifier_ids":["55555555-5555-4555-8555-555555555555"]}')::text),'CATALOG_MODIFIER_NOT_FOUND','12 ordinary product cannot be used as addition');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,1,%L)',id,(p||'{"image_url":"https://api.sbis.ru/img?x=1"}')::text),'INVALID_CATALOG_PHOTO','13 HTML SBIS image link rejected');
 p:=p||'{"image_url":"https://example.test/latte.webp","is_visible":true}';
 saved:=public.staff_save_catalog_product(id,1,p);
 PERFORM pg_temp.catalog_assert((saved->>'catalog_version')::int=2 AND EXISTS(SELECT 1 FROM public.get_ordering_catalog() c WHERE c.id='66666666-6666-4666-8666-666666666666'),'14 published product appears in app catalog');
 PERFORM pg_temp.catalog_assert(saved->'app_content'->'nutrition'->>'protein'='0' AND saved->'app_content'->>'size_label'='300 мл','15 exact nutrition including zero and portion persisted');
 PERFORM pg_temp.catalog_assert(public.staff_save_catalog_product(id,1,p)=saved,'16 uncertain update retry does not increment version');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,1,%L)',id,(p||'{"name":"Stale overwrite"}')::text),'CATALOG_CONFLICT','17 stale editor cannot overwrite another version');
 PERFORM pg_temp.catalog_error(format('SELECT public.staff_save_catalog_product(%L,2,%L)',id,(p||'{"price_mode":"sbis"}')::text),'CATALOG_MANUAL_SKU_PRICE_REQUIRED','18 manual SKU cannot follow nonexistent SBIS price');
 -- Existing SBIS SKU: explicit manual price, then restore current source price.
 saved:=public.staff_save_catalog_product('55555555-5555-4555-8555-555555555555',1,p);
 PERFORM pg_temp.catalog_assert((saved->>'price')::numeric=350 AND (saved->>'manual_price')::numeric=350,'19 manual price override accepted for SBIS item');
END $$;
RESET ROLE;
UPDATE public.products SET price=12,name='СБИС обновил имя',description='СБИС описание',raw_payload='{"cost":240}' WHERE id='55555555-5555-4555-8555-555555555555';
SELECT pg_temp.catalog_assert((SELECT price=350 AND app_content->>'name'='Тестовый латте' FROM public.products WHERE id='55555555-5555-4555-8555-555555555555'),'20 sync cannot overwrite manual price or app metadata');
DO $$ DECLARE p jsonb; saved jsonb; v int; BEGIN
 SELECT e.payload,products.catalog_version INTO p,v FROM public.product_catalog_edits e JOIN public.products ON products.id=e.product_id WHERE products.id='55555555-5555-4555-8555-555555555555';
 saved:=public.staff_save_catalog_product('55555555-5555-4555-8555-555555555555',v,p||'{"price_mode":"sbis"}');
 PERFORM pg_temp.catalog_assert((saved->>'price')::numeric=240 AND saved->>'manual_price' IS NULL,'21 restore current SBIS price ownership');
END $$;
UPDATE public.products SET price=260 WHERE id='55555555-5555-4555-8555-555555555555';
SELECT pg_temp.catalog_assert((SELECT price=260 FROM public.products WHERE id='55555555-5555-4555-8555-555555555555'),'22 subsequent SBIS price change accepted');
SELECT pg_temp.catalog_error($q$INSERT INTO public.order_items(product_id,product_name,quantity,price,modifiers) VALUES('66666666-6666-4666-8666-666666666666','Fixture',1,400,'[{"product_id":"44444444-4444-4444-8444-444444444444","quantity":1,"unit_price":50}]')$q$,'MODIFIER_NOT_ALLOWED','23 server rejects a forged disallowed addition');
INSERT INTO public.order_items(product_id,product_name,quantity,price,modifiers) VALUES('66666666-6666-4666-8666-666666666666','Fixture',1,380,'[{"product_id":"33333333-3333-4333-8333-333333333333","quantity":1,"unit_price":30}]');
SELECT pg_temp.catalog_assert((SELECT count(*)=1 FROM public.order_items),'24 allowed addition snapshot accepted');
CREATE OR REPLACE FUNCTION public.pickup_order_clock() RETURNS timestamptz
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT '2026-11-02T05:00:00Z'::timestamptz $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE
 p uuid:='66666666-6666-4666-8666-666666666666'; m uuid:='33333333-3333-4333-8333-333333333333';
 key uuid:=gen_random_uuid(); items jsonb; quote jsonb; contact jsonb; fulfillment jsonb; a public.orders%ROWTYPE; retry public.orders%ROWTYPE;
BEGIN
 items:=jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1,'modifiers',jsonb_build_array(jsonb_build_object('product_id',m,'quantity',1))));
 quote:=jsonb_build_object('version',2,'items',jsonb_build_array(jsonb_build_array(p::text||'|'||m::text||'x1',p,1,350,jsonb_build_array(jsonb_build_array(m,1,30)))),'payable',380);
 contact:=jsonb_build_object('customer_id',auth.uid(),'name','Catalog customer','phone','+79990000001','comment','');
 fulfillment:=jsonb_build_object('point_id','lenina-72','pickup_at',NULL);
 SELECT * INTO a FROM public.create_pickup_order(key,items,NULL,false,0,quote,contact,fulfillment);
 PERFORM pg_temp.catalog_assert(a.total=380 AND a.customer_id=auth.uid(),'29 actual pickup RPC accepts new manual product at server price');
 SELECT * INTO retry FROM public.create_pickup_order(key,items,NULL,false,0,quote,contact,fulfillment);
 PERFORM pg_temp.catalog_assert(retry.id=a.id,'30 real checkout retry returns original order');
 m:='44444444-4444-4444-8444-444444444444';
 items:=jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1,'modifiers',jsonb_build_array(jsonb_build_object('product_id',m,'quantity',1))));
 quote:=jsonb_build_object('version',2,'items',jsonb_build_array(jsonb_build_array(p::text||'|'||m::text||'x1',p,1,350,jsonb_build_array(jsonb_build_array(m,1,50)))),'payable',400);
 PERFORM pg_temp.catalog_error(format('SELECT public.create_pickup_order(%L,%L,NULL,false,0,%L,%L,%L)',gen_random_uuid(),items,quote,contact,fulfillment),'MODIFIER_NOT_ALLOWED','31 actual checkout rejects forged incompatible addition');
 PERFORM pg_temp.catalog_assert((SELECT count(*)=1 FROM public.orders),'32 failed checkout leaves no partial order');
END $$;
RESET ROLE;
UPDATE public.products SET is_visible=false WHERE id='55555555-5555-4555-8555-555555555555';
CREATE POLICY catalog_test_broad_storage ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.catalog_assert(NOT EXISTS(SELECT 1 FROM public.products WHERE id='55555555-5555-4555-8555-555555555555' AND NOT is_visible),'25 customer cannot read hidden product');
SELECT pg_temp.catalog_error($q$INSERT INTO storage.objects(bucket_id,name) VALUES('catalog-photos','11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.webp')$q$,'new row violates row-level security','26 customer cannot upload catalog photo');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
INSERT INTO storage.objects(bucket_id,name) VALUES('catalog-photos','22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.webp');
UPDATE storage.objects SET name='overwritten.webp' WHERE bucket_id='catalog-photos';
DELETE FROM storage.objects WHERE bucket_id='catalog-photos';
SELECT pg_temp.catalog_error($q$INSERT INTO storage.objects(bucket_id,name) VALUES('catalog-photos','11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.webp')$q$,'new row violates row-level security','27 staff cannot upload into another owner folder');
RESET ROLE;
SELECT pg_temp.catalog_assert((SELECT count(*)=1 FROM storage.objects),'28 staff upload policy accepts only own fresh photo path');
SELECT pg_temp.catalog_assert((SELECT name LIKE '%77777777-7777-4777-8777-777777777777.webp' FROM storage.objects),'33 restrictive policy blocks overwrite/delete even with another broad Storage policy');
SELECT * FROM catalog_checks ORDER BY test;
ROLLBACK;
