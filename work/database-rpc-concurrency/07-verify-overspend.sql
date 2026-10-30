-- SBL concurrent checkout test. Target: vxefueynagwuavlyeiqc; role: postgres.
-- Run ID: b79b2e51-0466-4a02-9eb8-5056eeee498b
ROLLBACK;
BEGIN READ ONLY;
WITH checks AS (
 SELECT '01 correct fixture user/product' AS test,(coalesce((SELECT raw_user_meta_data->>'sbl_audit_run' FROM auth.users WHERE id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b'::uuid),'')='b79b2e51-0466-4a02-9eb8-5056eeee498b' AND EXISTS(SELECT 1 FROM public.products WHERE id='628da134-2bae-474e-9268-ec761108080b' AND raw_payload->>'sbl_audit_run'='b79b2e51-0466-4a02-9eb8-5056eeee498b')) AS passed
 UNION ALL
 SELECT '02 real concurrent overlap confirmed',coalesce(((SELECT raw_user_meta_data FROM auth.users WHERE id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b')->>'overspend_overlap')::boolean,false)
 UNION ALL

 SELECT '03 competing redemption rejected with correct error',coalesce(((SELECT raw_user_meta_data FROM auth.users WHERE id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b')->>'overspend_b_rejected')::boolean,false)

 UNION ALL
 SELECT '04 only one order with correct key, total and debit',
  (SELECT count(*)=1 AND count(*) FILTER(WHERE idempotency_key='ea3ce6d4-849f-4849-92a3-8eb72ba8c185' AND total=100 AND bonus_redeemed=20 AND status='new')=1
   FROM public.orders WHERE customer_id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b')
 UNION ALL
 SELECT '05 exactly one item snapshot with quantity 1 and price 100',
  (SELECT count(*)=1 AND count(*) FILTER(WHERE i.product_id='628da134-2bae-474e-9268-ec761108080b' AND i.quantity=1 AND i.price=100)=1
   FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.customer_id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b')
 UNION ALL
 SELECT '06 exactly one 20-point redemption journal entry',
  (SELECT count(*)=1 AND count(*) FILTER(WHERE type='redeem' AND amount=20)=1 FROM public.bonus_transactions WHERE customer_id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b')
 UNION ALL
 SELECT '07 balance 10, debt 0, lifetime 0',EXISTS(
  SELECT 1 FROM public.bonus_accounts WHERE customer_id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b' AND balance=10 AND debt=0 AND lifetime_paid=0)
 UNION ALL

 SELECT '08 rejected second key left no order',NOT EXISTS(
  SELECT 1 FROM public.orders WHERE customer_id='9b6ec4c0-e0f1-45a4-9af2-0923c0f19d0b' AND idempotency_key='ddfcbe0e-4b3f-4960-9059-2780200c4f7b')

)
SELECT test,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result FROM checks ORDER BY test;
ROLLBACK;
