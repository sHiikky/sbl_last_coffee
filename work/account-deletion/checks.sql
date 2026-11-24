-- Behaviour checks for prepare_account_deletion (run after stub-schema.sql and the migration).
\set ON_ERROR_STOP on
INSERT INTO auth.users VALUES
 ('11111111-1111-1111-1111-111111111111'), -- customer with finished orders
 ('22222222-2222-2222-2222-222222222222'), -- customer with an active order
 ('33333333-3333-3333-3333-333333333333'), -- staff
 ('44444444-4444-4444-4444-444444444444'); -- other customer
INSERT INTO public.staff VALUES ('33333333-3333-3333-3333-333333333333');
INSERT INTO public.bonus_accounts VALUES ('11111111-1111-1111-1111-111111111111', 50);
INSERT INTO public.orders(customer_id,status,customer_name,customer_phone,comment,request_fingerprint) VALUES
 ('11111111-1111-1111-1111-111111111111','completed','Анна','+79991234567','без сахара','{"contact":{"phone":"+79991234567"}}'),
 ('11111111-1111-1111-1111-111111111111','cancelled','Анна','+79991234567',NULL,NULL),
 ('22222222-2222-2222-2222-222222222222','preparing','Илья','+79990000000',NULL,NULL),
 ('44444444-4444-4444-4444-444444444444','completed','Олег','+79995555555',NULL,NULL);

-- 1. Active order blocks deletion and changes nothing.
DO $$ BEGIN
  PERFORM public.prepare_account_deletion('22222222-2222-2222-2222-222222222222');
  RAISE EXCEPTION 'FAIL: active order did not block';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'ACTIVE_ORDERS%' THEN RAISE; END IF;
END $$;
SELECT 'PASS 1: active order blocks deletion' WHERE (SELECT customer_name FROM public.orders WHERE status='preparing') = 'Илья';

-- 2. Staff account is refused.
DO $$ BEGIN
  PERFORM public.prepare_account_deletion('33333333-3333-3333-3333-333333333333');
  RAISE EXCEPTION 'FAIL: staff not refused';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'STAFF_ACCOUNT%' THEN RAISE; END IF;
END $$;
SELECT 'PASS 2: staff account refused';

-- 3. Finished orders anonymized, other customers untouched, then the user can be deleted.
SELECT public.prepare_account_deletion('11111111-1111-1111-1111-111111111111') AS result;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE customer_id='11111111-1111-1111-1111-111111111111') THEN RAISE EXCEPTION 'FAIL: link kept'; END IF;
  IF (SELECT count(*) FROM public.orders WHERE customer_id IS NULL AND customer_name IS NULL AND customer_phone IS NULL AND comment IS NULL AND request_fingerprint IS NULL) <> 2 THEN RAISE EXCEPTION 'FAIL: personal data kept'; END IF;
  IF (SELECT customer_name FROM public.orders WHERE customer_id='44444444-4444-4444-4444-444444444444') <> 'Олег' THEN RAISE EXCEPTION 'FAIL: other customer changed'; END IF;
END $$;
-- the function itself deletes the Auth user
SELECT 'PASS 3: orders anonymized, user deleted, bonuses cascaded' WHERE NOT EXISTS (SELECT 1 FROM public.bonus_accounts WHERE customer_id='11111111-1111-1111-1111-111111111111') AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id='11111111-1111-1111-1111-111111111111');

-- 4. Triggers are back on after the function.
DO $$ BEGIN
  UPDATE public.orders SET customer_id='22222222-2222-2222-2222-222222222222' WHERE customer_id='44444444-4444-4444-4444-444444444444';
  RAISE EXCEPTION 'FAIL: trigger still disabled';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'BONUS_FIELDS_IMMUTABLE%' THEN RAISE; END IF;
END $$;
SELECT 'PASS 4: order triggers re-enabled';

-- 5. App users cannot call it directly.
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.prepare_account_deletion('44444444-4444-4444-4444-444444444444');
  RAISE EXCEPTION 'FAIL: authenticated could call';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
SELECT 'PASS 5: only service_role may call';
