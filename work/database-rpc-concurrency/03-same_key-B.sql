-- SBL concurrent checkout test. Target: vxefueynagwuavlyeiqc; role: postgres.
-- Run ID: b79b2e51-0466-4a02-9eb8-5056eeee498b
-- Revision 2: B waits for A readiness, including when B was started first.
ROLLBACK;
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='40s';
SET LOCAL application_name='sbl_rpc_b79b2e5104_same_key_b';
DO $session$
DECLARE o record; ready_deadline timestamptz; a_ready boolean:=false;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='1e7c63b0-550a-401e-9428-e7395d87e185'::uuid),'')<>'b79b2e51-0466-4a02-9eb8-5056eeee498b' THEN RAISE EXCEPTION 'Matching fixture user not found; run 01-setup.sql in the coffee project.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b' AND raw_payload->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b' AND sbis_id=-1685964379) THEN RAISE EXCEPTION 'Marked fixture product not found'; END IF;

 PERFORM set_config('request.jwt.claim.sub','1e7c63b0-550a-401e-9428-e7395d87e185',true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','1e7c63b0-550a-401e-9428-e7395d87e185','role','authenticated','is_anonymous',true)::text,true);
 IF auth.uid() IS DISTINCT FROM '1e7c63b0-550a-401e-9428-e7395d87e185'::uuid THEN RAISE EXCEPTION 'Unexpected customer context'; END IF;
 -- Poll without taking the advisory lock: only real application locks may block B.
 ready_deadline:=clock_timestamp()+interval '35 seconds';
 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(
   SELECT 1 FROM pg_locks ready
   JOIN pg_stat_activity activity ON activity.pid=ready.pid
   WHERE ready.locktype='advisory' AND ready.granted
     AND ready.classid=1900726185::oid AND ready.objid=1::oid AND ready.objsubid=2
     AND ready.database=(SELECT oid FROM pg_database WHERE datname=current_database())
     AND activity.application_name='sbl_rpc_b79b2e5104_same_key_a'
  ) INTO a_ready;
  EXIT WHEN a_ready;
  IF clock_timestamp()>=ready_deadline THEN
   RAISE EXCEPTION 'A_NOT_READY: start updated session A in the other tab within 35 seconds. B sent no checkout request.';
  END IF;
  PERFORM pg_sleep(0.1);
 END LOOP;

 SELECT * INTO o FROM public.create_order('85508ba9-aae3-4a1c-a10e-b3667d5acef2'::uuid,
  jsonb_build_array(jsonb_build_object('product_id','628da134-2bae-474e-9268-ec761108080b'::uuid,'quantity',1)),
  NULL,false,20,
  jsonb_build_object('items',jsonb_build_array(jsonb_build_array('628da134-2bae-474e-9268-ec761108080b'::uuid,1,100)),'payable',80));
 IF o.id IS NULL OR o.total IS DISTINCT FROM 100::numeric OR o.bonus_redeemed IS DISTINCT FROM 20 THEN
  RAISE EXCEPTION 'TEST_FAILED: unexpected order response';
 END IF;

 UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object(
  'same_key_b_order',o.id)
 WHERE id='1e7c63b0-550a-401e-9428-e7395d87e185' AND raw_user_meta_data->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b';

END;
$session$;
COMMIT;
SELECT 'same_key session B' AS test,'DONE' AS result;
