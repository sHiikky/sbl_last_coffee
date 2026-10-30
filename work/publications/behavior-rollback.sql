\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>5543
  OR current_database() NOT IN ('sbl_notes_final','sbl_content_test') THEN
  RAISE EXCEPTION 'DISPOSABLE_LOCAL_CONTENT_DATABASE_REQUIRED'; END IF;
END $$;
CREATE TEMP TABLE content_results(test text,result text);
GRANT ALL ON content_results TO anon,authenticated;
CREATE FUNCTION pg_temp.content_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
 INSERT INTO content_results VALUES(label,'PASS');
END $$;
CREATE FUNCTION pg_temp.content_error(query text,prefix text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE query;
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE prefix||'%' THEN RAISE; END IF;
  INSERT INTO content_results VALUES(label,'PASS'); RETURN;
 END;
 RAISE EXCEPTION 'FAIL: expected error % for %',prefix,label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.content_assert(boolean,text),pg_temp.content_error(text,text,text) TO anon,authenticated;
INSERT INTO auth.users(id) VALUES('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
INSERT INTO public.staff(user_id) VALUES('44444444-4444-4444-8444-444444444444');
INSERT INTO public.products(id,sbis_id,name,category,menu_category,menu_subcategory,price,is_visible,is_available,is_modifier)
 VALUES('55555555-5555-4555-8555-555555555555',-2140000901,'Content fixture','fixture','Напитки','Кофе',100,true,true,false);

SET LOCAL ROLE anon;
SELECT pg_temp.content_assert(jsonb_array_length(public.get_app_publications()->'items')=0,'01 anonymous visitor sees no drafts or invented posts');
SELECT pg_temp.content_assert(NOT has_table_privilege('anon','public.app_publications','SELECT') AND NOT has_table_privilege('anon','public.app_publications','INSERT'),'02 anonymous table access is closed');
SELECT pg_temp.content_assert(NOT has_function_privilege('anon','public.staff_save_app_publication(uuid,integer,jsonb)','EXECUTE'),'03 anonymous staff RPC execution denied');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
SELECT pg_temp.content_error('SELECT public.staff_list_app_publications()','STAFF_REQUIRED','04 customer cannot list staff drafts');
SELECT pg_temp.content_error($q$SELECT public.staff_save_app_publication(gen_random_uuid(),0,'{}')$q$,'STAFF_REQUIRED','05 customer cannot create publication');
SELECT pg_temp.content_assert(NOT has_table_privilege('authenticated','public.app_publications','INSERT') AND NOT has_table_privilege('authenticated','public.app_publications','UPDATE') AND NOT has_table_privilege('authenticated','public.app_publications','DELETE'),'06 direct authenticated writes denied');
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);

DO $$ DECLARE draft jsonb; again jsonb; active jsonb; changed jsonb; archived jsonb;
 payload jsonb:=jsonb_build_object('kind','news','status','draft','title','Draft','body','Only staff','image_url',NULL,'product_id',NULL,'starts_at',NULL,'ends_at',NULL);
 id uuid:='66666666-6666-4666-8666-666666666661'; live_id uuid:='66666666-6666-4666-8666-666666666662';
BEGIN
 draft:=public.staff_save_app_publication(id,0,payload);
 PERFORM pg_temp.content_assert((draft->>'version')::int=1 AND draft->>'status'='draft','07 staff saves a draft with version one');
 PERFORM pg_temp.content_assert(jsonb_array_length(public.get_app_publications()->'items')=0,'08 draft is absent from public RPC');
 PERFORM pg_temp.content_assert(jsonb_array_length(public.staff_list_app_publications()->'items')=1 AND public.staff_list_app_publications()->'items'->0->>'visibility'='draft','09 staff list contains draft and server visibility');
 again:=public.staff_save_app_publication(id,0,payload);
 PERFORM pg_temp.content_assert(again=draft,'10 lost create response retry returns same row and version');
 PERFORM pg_temp.content_assert(NOT (draft ? 'last_write_fingerprint'),'11 private write fingerprint excluded from staff result');
 payload:=payload||jsonb_build_object('status','published','title','<img src=x onerror=alert(1)>','body',E'Line one\r\nLine two','product_id','55555555-5555-4555-8555-555555555555','image_url','https://example.test/photo.webp','starts_at',now()-interval '1 minute');
 active:=public.staff_save_app_publication(live_id,0,payload);
 PERFORM pg_temp.content_assert(active->>'body'=E'Line one\nLine two','12 CRLF body normalized');
 PERFORM pg_temp.content_assert(jsonb_array_length(public.get_app_publications()->'items')=1,'13 active published news is public');
 PERFORM pg_temp.content_assert(public.get_app_publications()->'items'->0->>'title'='<img src=x onerror=alert(1)>','14 HTML-like title remains literal text');
 PERFORM pg_temp.content_assert(NOT (public.get_app_publications()->'items'->0 ? 'created_by') AND NOT (public.get_app_publications()->'items'->0 ? 'updated_by') AND NOT (public.get_app_publications()->'items'->0 ? 'last_write_fingerprint'),'15 public payload excludes author UID and internal write data');
 payload:=payload||jsonb_build_object('title','Edited');
 changed:=public.staff_save_app_publication(live_id,1,payload);
 PERFORM pg_temp.content_assert((changed->>'version')::int=2 AND changed->>'title'='Edited','16 expected-version edit increments exactly once');
 again:=public.staff_save_app_publication(live_id,1,payload);
 PERFORM pg_temp.content_assert(again=changed,'17 lost edit response retry does not increment version again');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,1,%L::jsonb)',live_id,payload||jsonb_build_object('title','Concurrent other edit')),'PUBLICATION_CONFLICT','18 stale competing writer cannot overwrite current publication');
 payload:=payload||jsonb_build_object('status','archived');
 archived:=public.staff_save_app_publication(live_id,2,payload);
 PERFORM pg_temp.content_assert((archived->>'version')::int=3 AND jsonb_array_length(public.get_app_publications()->'items')=0,'19 archive hides publication without deleting audit row');
 payload:=payload||jsonb_build_object('status','draft');
 again:=public.staff_save_app_publication(live_id,3,payload);
 PERFORM pg_temp.content_assert((again->>'version')::int=4 AND again->>'status'='draft','20 archived publication can be restored as draft');
 payload:=payload||jsonb_build_object('status','published','starts_at',now()+interval '1 hour','ends_at',now()+interval '2 hours');
 again:=public.staff_save_app_publication('66666666-6666-4666-8666-666666666663',0,payload);
 PERFORM pg_temp.content_assert(jsonb_array_length(public.get_app_publications()->'items')=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(public.staff_list_app_publications()->'items') p WHERE p->>'visibility'='scheduled'),'21 future schedule is hidden and labeled by server time');
 payload:=payload||jsonb_build_object('kind','promotion','starts_at',NULL,'ends_at',NULL);
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)','66666666-6666-4666-8666-666666666664',payload),'PUBLICATION_PROMOTION_END_REQUIRED','22 published promotion requires an end date');
 payload:=payload||jsonb_build_object('ends_at',now()+interval '1 hour');
 again:=public.staff_save_app_publication('66666666-6666-4666-8666-666666666664',0,payload);
 PERFORM pg_temp.content_assert(jsonb_array_length(public.get_app_publications()->'items')=1 AND public.get_app_publications()->'items'->0->>'kind'='promotion','23 promotion with valid current schedule is visible');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('starts_at',now()-interval '2 hours','ends_at',now()-interval '1 hour')),'PUBLICATION_ALREADY_EXPIRED','24 cannot publish an already expired campaign');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('image_url','javascript:alert(1)')),'INVALID_PUBLICATION_IMAGE','25 non-HTTPS image URL rejected');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('image_url','https://user:password@example.test/photo.jpg')),'INVALID_PUBLICATION_IMAGE','26 image URL cannot carry credentials');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('created_by','33333333-3333-4333-8333-333333333333')),'INVALID_PUBLICATION_FIELDS','27 cannot spoof author or set arbitrary columns');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('title',repeat('a',101))),'INVALID_PUBLICATION_TEXT','28 title length bounded server-side');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('product_id',gen_random_uuid())),'PUBLICATION_PRODUCT_UNAVAILABLE','29 missing product cannot be linked');
 PERFORM pg_temp.content_error(format('SELECT public.staff_save_app_publication(%L,0,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('starts_at','infinity')),'INVALID_PUBLICATION_SCHEDULE','30 infinite schedule rejected');
END $$;
RESET ROLE;
UPDATE public.app_publications SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour'
 WHERE id='66666666-6666-4666-8666-666666666664';
SET LOCAL ROLE anon;
SELECT pg_temp.content_assert(jsonb_array_length(public.get_app_publications()->'items')=0,'31 expired promotion disappears without staff action');
RESET ROLE;
SELECT pg_temp.content_assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.app_publications'::regclass),'32 publication table RLS enabled');
SELECT pg_temp.content_assert((SELECT count(*)=3 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_app_publications','staff_list_app_publications','staff_save_app_publication')),'33 exactly three content API functions expected');
SELECT test,result FROM content_results ORDER BY test;
ROLLBACK;
