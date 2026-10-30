-- SBL concurrent checkout test. Target: vxefueynagwuavlyeiqc; role: postgres.
-- Run ID: b79b2e51-0466-4a02-9eb8-5056eeee498b
-- Delete only this run's two marked users, their allowed test orders and marked product.
-- Run after A and B have finished, including when aborting the test.
ROLLBACK;
BEGIN READ WRITE;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $cleanup$
DECLARE baseline jsonb; after_counts jsonb;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name LIKE 'sbl_rpc_b79b2e5104%' AND pid<>pg_backend_pid() AND state<>'idle') THEN
  RAISE EXCEPTION 'Test sessions are still active. Wait for A and B before cleanup.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid)) THEN
  IF EXISTS(SELECT 1 FROM public.orders WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
  OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
  OR EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b') THEN
   RAISE EXCEPTION 'Unexpected orphan fixtures; review before cleanup.';
  END IF;
  PERFORM set_config('sbl_audit.rpc_cleanup',jsonb_build_object('test','RPC fixture cleanup','result','PASS','details','Fixtures already absent')::text,true);
  RETURN;
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid) AND raw_user_meta_data->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b')<>2 THEN
  RAISE EXCEPTION 'Fixture ownership mismatch; refusing cleanup.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b' AND raw_payload->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b' AND sbis_id=-1685964379) THEN RAISE EXCEPTION 'Marked fixture product not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid) AND (idempotency_key IS NULL OR idempotency_key NOT IN('85508ba9-aae3-4a1c-a10e-b3667d5acef2'::uuid,'ea3ce6d4-849f-4849-92a3-8eb72ba8c185'::uuid,'ddfcbe0e-4b3f-4960-9059-2780200c4f7b'::uuid)))
 OR EXISTS(SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE i.product_id='628da134-2bae-474e-9268-ec761108080b' AND o.customer_id IS DISTINCT FROM '1e7c63b0-550a-401e-9428-e7395d87e185'::uuid AND o.customer_id IS DISTINCT FROM '9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid)
 OR EXISTS(SELECT 1 FROM public.order_items WHERE product_id='628da134-2bae-474e-9268-ec761108080b' AND order_id IS NULL)
 OR EXISTS(SELECT 1 FROM public.staff WHERE user_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.reward_entitlements WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid)) THEN
  RAISE EXCEPTION 'Unexpected fixture relationships; refusing cleanup.';
 END IF;
 SELECT raw_user_meta_data->'baseline_counts' INTO baseline FROM auth.users WHERE id='1e7c63b0-550a-401e-9428-e7395d87e185';
 DELETE FROM public.bonus_transactions WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid);
 DELETE FROM public.order_items WHERE order_id IN(SELECT id FROM public.orders WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid));
 DELETE FROM public.orders WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid) AND idempotency_key IN('85508ba9-aae3-4a1c-a10e-b3667d5acef2'::uuid,'ea3ce6d4-849f-4849-92a3-8eb72ba8c185'::uuid,'ddfcbe0e-4b3f-4960-9059-2780200c4f7b'::uuid);
 DELETE FROM auth.users WHERE id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid) AND raw_user_meta_data->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b';
 DELETE FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b' AND raw_payload->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b';
 IF EXISTS(SELECT 1 FROM auth.users WHERE id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b')
 OR EXISTS(SELECT 1 FROM public.orders WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.reward_progress WHERE customer_id IN('1e7c63b0-550a-401e-9428-e7395d87e185'::uuid,'9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid))
 OR EXISTS(SELECT 1 FROM public.order_items WHERE product_id='628da134-2bae-474e-9268-ec761108080b') THEN
  RAISE EXCEPTION 'Fixture cleanup verification failed; cleanup transaction rolled back.';
 END IF;
 SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'products',(SELECT count(*) FROM public.products),'orders',(SELECT count(*) FROM public.orders),'items',(SELECT count(*) FROM public.order_items),'bonus_accounts',(SELECT count(*) FROM public.bonus_accounts),'bonus_transactions',(SELECT count(*) FROM public.bonus_transactions),'reward_progress',(SELECT count(*) FROM public.reward_progress),'reward_entitlements',(SELECT count(*) FROM public.reward_entitlements),'staff',(SELECT count(*) FROM public.staff)) INTO after_counts;
 PERFORM set_config('sbl_audit.rpc_cleanup',jsonb_build_object('test','RPC fixture cleanup','result','PASS',
  'details','Only marked fixture users, orders and product removed; sequence numbers not reset',
  'global_counts_match_baseline',baseline=after_counts,'baseline_counts',baseline,'after_counts',after_counts)::text,true);
END;
$cleanup$;
SELECT current_setting('sbl_audit.rpc_cleanup')::jsonb AS cleanup_report;
COMMIT;
