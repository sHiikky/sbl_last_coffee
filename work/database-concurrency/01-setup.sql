-- SBL concurrency test. Target project: vxefueynagwuavlyeiqc.
-- Run ID: 7ba8fb0c-db68-4284-9eba-4bb88d9f2c43
-- Creates one marked test user, one account/progress row, two test orders.
-- Data is committed so two independent sessions can access it.
ROLLBACK;
BEGIN READ WRITE;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
DO $setup$
DECLARE baseline jsonb;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF to_regprocedure('public.create_order(uuid,jsonb,text,boolean,numeric,jsonb)') IS NULL
 OR to_regprocedure('public.get_loyalty_state()') IS NULL
 OR to_regclass('public.reward_progress') IS NULL THEN
  RAISE EXCEPTION 'Coffee schema not found; check the selected project.';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 OR EXISTS(SELECT 1 FROM public.orders WHERE id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828')) THEN
  RAISE EXCEPTION 'Fixtures already exist. Do not rerun setup; finish tests or run 08-cleanup.sql first.';
 END IF;
 SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'orders',(SELECT count(*) FROM public.orders),'items',(SELECT count(*) FROM public.order_items),'bonus_accounts',(SELECT count(*) FROM public.bonus_accounts),'bonus_transactions',(SELECT count(*) FROM public.bonus_transactions),'reward_progress',(SELECT count(*) FROM public.reward_progress),'reward_entitlements',(SELECT count(*) FROM public.reward_entitlements),'staff',(SELECT count(*) FROM public.staff)) INTO baseline;
 INSERT INTO auth.users(id,is_anonymous,role,aud,raw_user_meta_data,created_at,updated_at)
 VALUES('369f99f3-31f0-4e86-9752-fc30edc927b7',true,'authenticated','authenticated',
  jsonb_build_object('sbl_audit_run','7ba8fb0c-db68-4284-9eba-4bb88d9f2c43','label','SBL concurrency test','baseline_counts',baseline),now(),now());
 INSERT INTO public.bonus_accounts(customer_id,balance,debt,lifetime_paid) VALUES('369f99f3-31f0-4e86-9752-fc30edc927b7',0,0,9990);
 INSERT INTO public.reward_progress(customer_id) VALUES('369f99f3-31f0-4e86-9752-fc30edc927b7');
 INSERT INTO public.orders(id,customer_id,total,status)
 VALUES('fc200a96-6b09-4694-8f9b-e2478cedd75e','369f99f3-31f0-4e86-9752-fc30edc927b7',20,'new'),('1e69fa2c-26c5-4b9e-a434-cc76ed5be828','369f99f3-31f0-4e86-9752-fc30edc927b7',20,'new');
END;
$setup$;
COMMIT;
SELECT 'SETUP' AS test,'READY' AS result,
 jsonb_build_object('test_order_numbers',(SELECT jsonb_agg(order_number ORDER BY order_number)
 FROM public.orders WHERE id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828'))) AS details;
