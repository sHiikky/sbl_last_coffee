-- SBL concurrency test. Target project: vxefueynagwuavlyeiqc.
-- Run ID: 7ba8fb0c-db68-4284-9eba-4bb88d9f2c43
ROLLBACK;
BEGIN READ ONLY;
WITH checks AS (
 SELECT '01 matching fixture user' AS test,coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7'::uuid),'')='7ba8fb0c-db68-4284-9eba-4bb88d9f2c43' AS passed
 UNION ALL
 SELECT '02 real concurrent overlap confirmed',coalesce((SELECT (raw_user_meta_data->>'completion_overlap')::boolean FROM auth.users WHERE id='369f99f3-31f0-4e86-9752-fc30edc927b7'),false)
 UNION ALL
 SELECT '03 both test orders have expected status',
  (SELECT count(*)=2 FROM public.orders WHERE id IN('fc200a96-6b09-4694-8f9b-e2478cedd75e','1e69fa2c-26c5-4b9e-a434-cc76ed5be828') AND customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND status='completed')
 UNION ALL
 SELECT '04 exact bonus balance, debt and lifetime',EXISTS(
  SELECT 1 FROM public.bonus_accounts WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND balance=3 AND debt=0 AND lifetime_paid=10030)
 UNION ALL
 SELECT '05 exact two journal amounts: 1 and 2 points',coalesce((
  SELECT array_agg(amount ORDER BY amount)=ARRAY[1,2]
  FROM public.bonus_transactions WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND type='earn'),false)
 UNION ALL
 SELECT '06 repeated status created no duplicate journal entries',
  (SELECT count(*)=2 FROM public.bonus_transactions WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7')
 UNION ALL
 SELECT '07 same-day completions counted as one visit',EXISTS(
  SELECT 1 FROM public.reward_progress WHERE customer_id='369f99f3-31f0-4e86-9752-fc30edc927b7' AND current_streak=1)
)
SELECT test,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result FROM checks ORDER BY test;
ROLLBACK;
