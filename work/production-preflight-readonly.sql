-- Run in the linked project's Supabase SQL Editor. No data or schema changes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';

SELECT current_database() AS database_name, current_user AS inspected_as,
 clock_timestamp() AS checked_at;
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;

-- These are the same historical blockers enforced by the bonus migration.
SELECT 'duplicate_order_type_groups' AS check_name,count(*) AS issue_count
FROM (SELECT order_id,type FROM public.bonus_transactions WHERE order_id IS NOT NULL
 GROUP BY order_id,type HAVING count(*)>1) d
UNION ALL
SELECT 'journal_customer_mismatch',count(*)
FROM public.orders o JOIN public.bonus_transactions t ON t.order_id=o.id
WHERE t.customer_id IS DISTINCT FROM o.customer_id
UNION ALL
SELECT 'earning_amount_mismatch',count(*)
FROM public.orders o JOIN public.bonus_transactions t ON t.order_id=o.id
WHERE t.type='earn' AND t.amount<>o.bonus_earned
UNION ALL
SELECT 'cancelled_orders_with_earn_journal',count(*)
FROM public.orders o JOIN public.bonus_transactions t ON t.order_id=o.id
WHERE t.type='earn' AND o.status='cancelled'
UNION ALL
SELECT 'earned_without_journal',count(*) FROM public.orders o
WHERE o.bonus_earned>0 AND NOT EXISTS(
 SELECT 1 FROM public.bonus_transactions t WHERE t.order_id=o.id AND t.type='earn')
UNION ALL
SELECT 'negative_lifetime',count(*) FROM public.bonus_accounts WHERE lifetime_paid<0
UNION ALL
SELECT 'negative_order_earning',count(*) FROM public.orders WHERE bonus_earned<0;

-- Diagnostic counts: require interpretation, do not automatically repair.
SELECT 'cancelled_with_positive_earnings' AS diagnostic,count(*) AS row_count
FROM public.orders WHERE status='cancelled' AND bonus_earned>0
UNION ALL
SELECT 'cancelled_redeemed_not_refunded',count(*) FROM public.orders
WHERE status='cancelled' AND bonus_redeemed>0 AND NOT bonus_refunded
UNION ALL
SELECT 'completed_without_bonus_account',count(*) FROM public.orders o
WHERE o.status='completed' AND o.customer_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM public.bonus_accounts a WHERE a.customer_id=o.customer_id)
UNION ALL
SELECT 'account_lifetime_below_known_non_cancelled_cash',count(*)
FROM public.bonus_accounts a JOIN (
 SELECT customer_id,sum(greatest(total-bonus_redeemed,0)) AS known_cash
 FROM public.orders WHERE status='completed' OR (status<>'cancelled' AND bonus_earned>0)
 GROUP BY customer_id) o ON o.customer_id=a.customer_id
WHERE a.lifetime_paid<o.known_cash;

SELECT status,count(*) AS orders_count FROM public.orders GROUP BY status ORDER BY status;
SELECT type,count(*) AS transactions_count FROM public.bonus_transactions GROUP BY type ORDER BY type;
SELECT count(*) AS accounts_count,min(balance) AS minimum_balance,
 min(lifetime_paid) AS minimum_lifetime FROM public.bonus_accounts;

SELECT p.oid::regprocedure::text AS application_function,p.prosecdef AS security_definer,
 p.proconfig AS configuration,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND NOT EXISTS(
 SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
ORDER BY application_function;
ROLLBACK;
