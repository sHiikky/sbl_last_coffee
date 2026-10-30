-- SBL concurrency test. Target project: vxefueynagwuavlyeiqc.
-- Run ID: 7ba8fb0c-db68-4284-9eba-4bb88d9f2c43
-- Run in a SECOND SQL Editor browser tab while A is waiting.
-- A waits up to 35 seconds and confirms that B is actually blocked by A.
ROLLBACK;
BEGIN READ WRITE;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='40s';
SET LOCAL application_name='sbl_audit_7ba8fb0cdb_completion_b';
DO $session$

BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
 IF coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7'::uuid),'') <> '7ba8fb0c-db68-4284-9eba-4bb88d9f2c43' THEN RAISE EXCEPTION 'Matching test fixtures not found. Run 01-setup.sql in the coffee project.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id='1e69fa2c-26c5-4b9e-a434-cc76ed5be828' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND status='new')
  THEN
  RAISE EXCEPTION 'Fixture state is not ready for completion. Do not repeat completed stages; use cleanup/setup to restart.';
 END IF;
 UPDATE public.orders SET status='completed' WHERE id='1e69fa2c-26c5-4b9e-a434-cc76ed5be828' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7';
 -- A repeated status must not pay or reverse points twice.
 UPDATE public.orders SET status='completed' WHERE id='1e69fa2c-26c5-4b9e-a434-cc76ed5be828' AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7';

END;
$session$;
COMMIT;
SELECT 'completion session B' AS test,'DONE' AS result;
