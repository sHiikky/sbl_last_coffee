-- SBL concurrent checkout test. Target: vxefueynagwuavlyeiqc; role: postgres.
-- Run ID: b79b2e51-0466-4a02-9eb8-5056eeee498b
ROLLBACK;
BEGIN READ ONLY;
WITH checks AS (
 SELECT '01 correct fixture user/product' AS test,(coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='1e7c63b0-550a-401e-9428-e7395d87e185'::uuid),'')='b79b2e51-0466-4a02-9eb8-5056eeee498b' AND EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b' AND raw_payload->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b')) AS passed
 UNION ALL
 SELECT '02 real concurrent overlap confirmed',coalesce(((SELECT raw_user_meta_data FROM auth.users WHERE id='1e7c63b0-550a-401e-9428-e7395d87e185')->>'same_key_overlap')::boolean,false)
 UNION ALL

 SELECT '03 both sessions returned the same existing order',coalesce((
  SELECT raw_user_meta_data->>'same_key_a_order'=raw_user_meta_data->>'same_key_b_order'
   AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id::text=raw_user_meta_data->>'same_key_a_order' AND o.customer_id='1e7c63b0-550a-401e-9428-e7395d87e185' AND o.idempotency_key='85508ba9-aae3-4a1c-a10e-b3667d5acef2')
  FROM auth.users WHERE id='1e7c63b0-550a-401e-9428-e7395d87e185'),false)

 UNION ALL
 SELECT '04 only one order with correct key, total and debit',
  (SELECT count(*)=1 AND count(*) FILTER(WHERE idempotency_key='85508ba9-aae3-4a1c-a10e-b3667d5acef2' AND total=100 AND bonus_redeemed=20 AND status='new')=1
   FROM public.orders WHERE customer_id='1e7c63b0-550a-401e-9428-e7395d87e185')
 UNION ALL
 SELECT '05 exactly one item snapshot with quantity 1 and price 100',
  (SELECT count(*)=1 AND count(*) FILTER(WHERE i.product_id='628da134-2bae-474e-9268-ec761108080b' AND i.quantity=1 AND i.price=100)=1
   FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.customer_id='1e7c63b0-550a-401e-9428-e7395d87e185')
 UNION ALL
 SELECT '06 exactly one 20-point redemption journal entry',
  (SELECT count(*)=1 AND count(*) FILTER(WHERE type='redeem' AND amount=20)=1 FROM public.bonus_transactions WHERE customer_id='1e7c63b0-550a-401e-9428-e7395d87e185')
 UNION ALL
 SELECT '07 balance 10, debt 0, lifetime 0',EXISTS(
  SELECT 1 FROM public.bonus_accounts WHERE customer_id='1e7c63b0-550a-401e-9428-e7395d87e185' AND balance=10 AND debt=0 AND lifetime_paid=0)
 UNION ALL

 SELECT '08 no duplicate idempotency key',NOT EXISTS(
  SELECT 1 FROM public.orders WHERE customer_id='1e7c63b0-550a-401e-9428-e7395d87e185' GROUP BY idempotency_key HAVING count(*)>1)

)
SELECT test,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result FROM checks ORDER BY test;
ROLLBACK;
