\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() <> 5543 OR current_database() <> 'sbl_notifications_test'
 THEN RAISE EXCEPTION 'DISPOSABLE_LOCAL_NOTIFICATION_DATABASE_REQUIRED'; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
 RAISE NOTICE 'PASS: %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text) TO authenticated,service_role;
CREATE TEMP TABLE test_claims (sequence integer PRIMARY KEY, payload jsonb);
GRANT ALL ON test_claims TO authenticated, service_role;
INSERT INTO auth.users(id,phone,phone_confirmed_at) VALUES
 ('11111111-1111-4111-8111-111111111111','79990000001',now()),
 ('22222222-2222-4222-8222-222222222222','79990000002',now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT public.register_device_push_token('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]','android','bff41dba-7718-423d-8898-1003aae445db');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT public.register_device_push_token('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]','ios','bff41dba-7718-423d-8898-1003aae445db');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.device_push_tokens),'token owner sees only own registration');
DO $$ BEGIN
 BEGIN
  PERFORM public.register_device_push_token('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]','android','bff41dba-7718-423d-8898-1003aae445db');
  RAISE EXCEPTION 'Foreign token transfer without installation proof unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: foreign token cannot be taken over with a different installation id';
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT public.register_device_push_token('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]','android','bff41dba-7718-423d-8898-1003aae445db');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.device_push_tokens),'same installation may follow an authenticated account switch');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT public.register_device_push_token('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]','android','bff41dba-7718-423d-8898-1003aae445db');
DO $$ BEGIN
 BEGIN UPDATE public.device_push_tokens SET enabled=false; RAISE EXCEPTION 'Direct token writes unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.claim_order_notifications(NULL,1); RAISE EXCEPTION 'Customer worker call unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM count(*) FROM public.order_notification_outbox; RAISE EXCEPTION 'Customer outbox read unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: direct token writes, outbox reads and worker execution denied to customer';
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.register_device_push_token('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]','android','bff41dba-7718-423d-8898-1003aae445db'); RAISE EXCEPTION 'Anon role registration unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: unauthenticated API role cannot register tokens';
END $$;
RESET ROLE;

INSERT INTO public.orders(id,customer_id,total,status) VALUES
 ('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',100,'new'),
 ('10000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',100,'new'),
 ('10000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',100,'new');
UPDATE public.orders SET status='ready' WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE public.orders SET status='ready' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.order_notification_outbox WHERE order_id='10000000-0000-4000-8000-000000000001'),'repeated status creates one outbox event');
SET LOCAL ROLE service_role;
INSERT INTO test_claims SELECT 1,payload FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000001',1) payload;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000001',1)),'active lease excludes a second worker');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(payload->'deliveries')=1 FROM test_claims WHERE sequence=1),'claim contains only the customer device');
SELECT pg_temp.assert_true(public.renew_order_notification_lease((payload->>'id')::uuid,(payload->>'lease_id')::uuid),'live lease is checked and renewed before outbound HTTP') FROM test_claims WHERE sequence=1;
SELECT pg_temp.assert_true(NOT public.record_order_notification_result((payload->>'id')::uuid,gen_random_uuid(),(payload->'deliveries'->0->>'id')::uuid,'delivered'), 'wrong worker lease cannot acknowledge delivery') FROM test_claims WHERE sequence=1;
RESET ROLE;
UPDATE public.order_notification_outbox SET leased_until=now()-interval '1 second' WHERE order_id='10000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT public.renew_order_notification_lease((payload->>'id')::uuid,(payload->>'lease_id')::uuid),'expired lease cannot be renewed by a late worker') FROM test_claims WHERE sequence=1;
INSERT INTO test_claims SELECT 2,payload FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000001',1) payload;
SELECT pg_temp.assert_true((SELECT (SELECT payload->>'lease_id' FROM test_claims WHERE sequence=1) <> (SELECT payload->>'lease_id' FROM test_claims WHERE sequence=2)), 'expired lease is reclaimed with a new fencing token');
SELECT pg_temp.assert_true(NOT public.record_order_notification_result((payload->>'id')::uuid,(payload->>'lease_id')::uuid,(payload->'deliveries'->0->>'id')::uuid,'delivered'), 'stale worker acknowledgement is rejected') FROM test_claims WHERE sequence=1;
SELECT pg_temp.assert_true(public.record_order_notification_result((payload->>'id')::uuid,(payload->>'lease_id')::uuid,(payload->'deliveries'->0->>'id')::uuid,'ticketed','test-ticket-1'), 'Expo ticket recorded without marking it delivered') FROM test_claims WHERE sequence=2;
SELECT public.finish_order_notification((payload->>'id')::uuid,(payload->>'lease_id')::uuid) FROM test_claims WHERE sequence=2;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000001',1)), 'receipt wait does not immediately resend');
RESET ROLE;
UPDATE public.order_notification_outbox SET available_at=now()-interval '1 second' WHERE order_id='10000000-0000-4000-8000-000000000001';
UPDATE public.order_notification_deliveries SET next_attempt_at=now()-interval '1 second' WHERE ticket_id='test-ticket-1';
SET LOCAL ROLE service_role;
INSERT INTO test_claims SELECT 3,payload FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000001',1) payload;
SELECT pg_temp.assert_true((SELECT payload->'deliveries'->0->>'state'='ticketed' FROM test_claims WHERE sequence=3), 'receipt polling retains the accepted ticket');
SELECT public.record_order_notification_result((payload->>'id')::uuid,(payload->>'lease_id')::uuid,(payload->'deliveries'->0->>'id')::uuid,'disabled',NULL,'DeviceNotRegistered') FROM test_claims WHERE sequence=3;
SELECT public.finish_order_notification((payload->>'id')::uuid,(payload->>'lease_id')::uuid) FROM test_claims WHERE sequence=3;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.device_push_tokens WHERE user_id='11111111-1111-4111-8111-111111111111'),'DeviceNotRegistered invalidates the exact old token');

UPDATE public.orders SET status='ready' WHERE id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT public.unregister_device_push_token('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
SET LOCAL ROLE service_role;
INSERT INTO test_claims SELECT 4,payload FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000002',1) payload;
SELECT pg_temp.assert_true((SELECT jsonb_array_length(payload->'deliveries')=0 FROM test_claims WHERE sequence=4),'opt-out before dispatch leaves no recipient');
SELECT public.finish_order_notification((payload->>'id')::uuid,(payload->>'lease_id')::uuid) FROM test_claims WHERE sequence=4;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT state='no_devices' FROM public.order_notification_outbox WHERE order_id='10000000-0000-4000-8000-000000000002'),'event without subscribed devices finishes without sending');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT public.register_device_push_token('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]','android','bff41dba-7718-423d-8898-1003aae445db');
RESET ROLE;
UPDATE public.orders SET status='ready' WHERE id='10000000-0000-4000-8000-000000000003';
UPDATE public.orders SET status='cancelled' WHERE id='10000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true((SELECT state='superseded' FROM public.order_notification_outbox WHERE order_id='10000000-0000-4000-8000-000000000003' AND event_status='ready'),'cancellation supersedes a queued ready notification');
SET LOCAL ROLE service_role;
INSERT INTO test_claims SELECT 5,payload FROM public.claim_order_notifications('10000000-0000-4000-8000-000000000003',1) payload;
SELECT pg_temp.assert_true((SELECT payload->>'event_status'='cancelled' FROM test_claims WHERE sequence=5),'worker receives cancellation, not stale readiness');
SELECT public.record_order_notification_result((payload->>'id')::uuid,(payload->>'lease_id')::uuid,(payload->'deliveries'->0->>'id')::uuid,'delivered') FROM test_claims WHERE sequence=5;
SELECT public.finish_order_notification((payload->>'id')::uuid,(payload->>'lease_id')::uuid) FROM test_claims WHERE sequence=5;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT state='sent' FROM public.order_notification_outbox WHERE order_id='10000000-0000-4000-8000-000000000003' AND event_status='cancelled'),'receipt delivery finishes the event');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO test_claims VALUES(6,public.request_account_deletion());
SELECT pg_temp.assert_true((SELECT payload->>'status'='pending' AND (payload->>'active_order_count')::integer>0 FROM test_claims WHERE sequence=6),'deletion is queued honestly while orders remain active');
SELECT pg_temp.assert_true((SELECT public.request_account_deletion()->>'id'=payload->>'id' FROM test_claims WHERE sequence=6),'repeated deletion request is idempotent');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT pg_temp.assert_true(public.get_account_deletion_request() IS NULL AND (SELECT count(*)=0 FROM public.account_deletion_requests),'customer cannot read another deletion request');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.orders) AND (SELECT count(*)=2 FROM auth.users),'request did not delete orders or users');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.finish_order_notification(uuid,uuid)','execute') AND NOT has_function_privilege('authenticated','public.renew_order_notification_lease(uuid,uuid)','execute') AND NOT has_function_privilege('anon','public.request_account_deletion()','execute'),'internal worker and deletion API grants are restricted');
ROLLBACK;
