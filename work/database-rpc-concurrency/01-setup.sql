-- SBL concurrent checkout test. Target: vxefueynagwuavlyeiqc; role: postgres.
-- Run ID: b79b2e51-0466-4a02-9eb8-5056eeee498b
-- Commits two marked test users/accounts, two progress rows and one marked test product.
-- Existing customers and catalog rows are not modified.
ROLLBACK;
BEGIN READ WRITE;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $setup$
DECLARE baseline jsonb;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NULL
 OR to_regclass('public.reward_progress') IS NULL THEN RAISE EXCEPTION 'Coffee schema not found; check the selected project.'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b' OR sbis_id=-1685964379) THEN
  RAISE EXCEPTION 'Fixtures already exist or identifier conflict. Do not repeat setup; finish or clean up first.';
 END IF;
 SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'products',(SELECT count(*) FROM public.products),'orders',(SELECT count(*) FROM public.orders),'items',(SELECT count(*) FROM public.order_items),'bonus_accounts',(SELECT count(*) FROM public.bonus_accounts),'bonus_transactions',(SELECT count(*) FROM public.bonus_transactions),'reward_progress',(SELECT count(*) FROM public.reward_progress),'reward_entitlements',(SELECT count(*) FROM public.reward_entitlements),'staff',(SELECT count(*) FROM public.staff)) INTO baseline;
 INSERT INTO auth.users(id,is_anonymous,role,aud,raw_user_meta_data,created_at,updated_at)
 VALUES('1e7c63b0-550a-401e-9428-e7395d87e185',true,'authenticated','authenticated',jsonb_build_object('sbl_audit_run','b79b2e51-0466-4a02-9eb8-5056eeee498b','label','SQL TEST same-key checkout','baseline_counts',baseline),now(),now()),
 ('9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b',true,'authenticated','authenticated',jsonb_build_object('sbl_audit_run','b79b2e51-0466-4a02-9eb8-5056eeee498b','label','SQL TEST competing redemption'),now(),now());
 INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_visible,is_available,is_modifier,raw_payload)
 VALUES('628da134-2bae-474e-9268-ec761108080b',-1685964379,'[SQL TEST b79b2e51] temporary product','test','Десерты',100,true,true,false,jsonb_build_object('sbl_audit_run','b79b2e51-0466-4a02-9eb8-5056eeee498b'));
 INSERT INTO public.bonus_accounts(customer_id,balance,debt,lifetime_paid) VALUES('1e7c63b0-550a-401e-9428-e7395d87e185',30,0,0),('9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b',30,0,0);
 INSERT INTO public.reward_progress(customer_id) VALUES('1e7c63b0-550a-401e-9428-e7395d87e185'),('9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b');
END;
$setup$;
COMMIT;
SELECT 'SETUP' AS test,'READY' AS result,'Two fixture customers, 30 points each; temporary product priced at 100' AS details;
