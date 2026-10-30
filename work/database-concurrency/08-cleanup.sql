-- SBL concurrency test. Target project: vxefueynagwuavlyeiqc.
-- Run ID: 7ba8fb0c-db68-4284-9eba-4bb88d9f2c43
-- Removes ONLY this marked test user and their two known test orders.
-- Can be run after verification, or to abort/restart the test.
ROLLBACK;
BEGIN READ WRITE;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $cleanup$
DECLARE baseline jsonb; after_counts jsonb;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7') THEN
  IF EXISTS(SELECT 1 FROM public.orders WHERE id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828') OR customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7')
  OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7') THEN
   RAISE EXCEPTION 'Unexpected orphan fixtures; review before cleanup.';
  END IF;
  PERFORM set_config('sbl_audit.cleanup',jsonb_build_object('test','fixture cleanup','result','PASS','details','Fixture user and orders are already absent')::text,true);
  RETURN;
 END IF;
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7'::uuid),'') <> '7ba8fb0c-db68-4284-9eba-4bb88d9f2c43' THEN RAISE EXCEPTION 'Matching test fixtures not found. Run 01-setup.sql in the coffee project.'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND id NOT IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828'))
 OR EXISTS(SELECT 1 FROM public.orders WHERE id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828') AND customer_id IS DISTINCT FROM '369f99f3-31f0-4e86-9752-fc30edc927b7'::uuid)
 OR EXISTS(SELECT 1 FROM public.staff WHERE user_id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 OR EXISTS(SELECT 1 FROM public.reward_entitlements WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7') THEN
  RAISE EXCEPTION 'Unexpected fixture relationships; refusing automatic cleanup.';
 END IF;
 SELECT raw_user_meta_data->'baseline_counts' INTO baseline FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7';
 DELETE FROM public.bonus_transactions WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7';
 DELETE FROM public.orders WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828');
 DELETE FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND raw_user_meta_data->>'sbl_audit_run'='7ba8fb0c-db68-4284-9eba-4bb88d9f2c43';
 -- Account and progress rows use ON DELETE CASCADE from auth.users.
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 OR EXISTS(SELECT 1 FROM public.orders WHERE id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828') OR customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 OR EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 OR EXISTS(SELECT 1 FROM public.reward_progress WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7') THEN
  RAISE EXCEPTION 'Fixture cleanup verification failed; cleanup transaction rolled back.';
 END IF;
 SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'orders',(SELECT count(*) FROM public.orders),'items',(SELECT count(*) FROM public.order_items),'bonus_accounts',(SELECT count(*) FROM public.bonus_accounts),'bonus_transactions',(SELECT count(*) FROM public.bonus_transactions),'reward_progress',(SELECT count(*) FROM public.reward_progress),'reward_entitlements',(SELECT count(*) FROM public.reward_entitlements),'staff',(SELECT count(*) FROM public.staff)) INTO after_counts;
 PERFORM set_config('sbl_audit.cleanup',jsonb_build_object(
  'test','fixture cleanup','result','PASS','details','Only this run fixtures removed; sequence numbers are not reset',
  'global_counts_match_baseline',baseline=after_counts,
  'baseline_counts',baseline,'after_counts',after_counts)::text,true);
END;
$cleanup$;
SELECT current_setting('sbl_audit.cleanup')::jsonb AS cleanup_report;
COMMIT;
