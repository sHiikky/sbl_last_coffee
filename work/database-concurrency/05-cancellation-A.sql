-- SBL concurrency test. Target project: vxefueynagwuavlyeiqc.
-- Run ID: 7ba8fb0c-db68-4284-9eba-4bb88d9f2c43
-- Start A, then run B in ANOTHER SQL Editor browser tab while A is waiting.
-- A waits up to 35 seconds and confirms that B is actually blocked by A.
ROLLBACK;
BEGIN READ WRITE;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='40s';
SET LOCAL application_name='sbl_audit_7ba8fb0cdb_cancellation_a';
DO $session$
DECLARE deadline timestamptz; overlap boolean:=false;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7'::uuid),'') <> '7ba8fb0c-db68-4284-9eba-4bb88d9f2c43' THEN RAISE EXCEPTION 'Matching test fixtures not found. Run 01-setup.sql in the coffee project.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id='fc200a96-6b09-4694-8f9b-e2478cedd75e' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND status='completed')
 OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id='1e69fa2c-26c5-4b9e-a434-cc76ed5be828' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND status='completed') THEN
  RAISE EXCEPTION 'Fixture state is not ready for cancellation. Do not repeat completed stages; use cleanup/setup to restart.';
 END IF;
 UPDATE public.orders SET status='cancelled' WHERE id='fc200a96-6b09-4694-8f9b-e2478cedd75e' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7';
 -- A repeated status must not pay or reverse points twice.
 UPDATE public.orders SET status='cancelled' WHERE id='fc200a96-6b09-4694-8f9b-e2478cedd75e' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7';

 deadline:=clock_timestamp()+interval '35 seconds';
 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(
   SELECT 1 FROM pg_stat_activity activity
   WHERE activity.application_name='sbl_audit_7ba8fb0cdb_cancellation_b'
     AND activity.pid<>pg_backend_pid()
     AND pg_backend_pid()=ANY(pg_blocking_pids(activity.pid))
  ) INTO overlap;
  EXIT WHEN overlap;
  IF clock_timestamp()>=deadline THEN
   RAISE EXCEPTION 'NO_OVERLAP: B did not reach the lock within 35 seconds. A was rolled back; check B state before retrying.';
  END IF;
  PERFORM pg_sleep(0.1);
 END LOOP;
 UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
  ||jsonb_build_object('cancellation_overlap',true)
 WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND raw_user_meta_data->>'sbl_audit_run'='7ba8fb0c-db68-4284-9eba-4bb88d9f2c43';

END;
$session$;
COMMIT;
SELECT 'cancellation session A' AS test,'DONE' AS result;
