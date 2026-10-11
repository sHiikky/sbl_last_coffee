-- Aggregate historical orders only; no changes and no customer identities.
SELECT jsonb_build_object(
 'completed_orders',count(*),
 'customers',count(DISTINCT o.customer_id),
 'without_customer',count(*) FILTER(WHERE o.customer_id IS NULL),
 'cash_total',coalesce(sum(greatest(o.total-o.bonus_redeemed,0)),0),
 'positive_cash_orders',count(*) FILTER(WHERE o.total-o.bonus_redeemed>0),
 'earned_total',coalesce(sum(o.bonus_earned),0),
 'redeemed_total',coalesce(sum(o.bonus_redeemed),0),
 'with_bonus_account',count(*) FILTER(WHERE EXISTS(
  SELECT 1 FROM public.bonus_accounts a WHERE a.customer_id=o.customer_id)),
 'with_any_bonus_journal',count(*) FILTER(WHERE EXISTS(
  SELECT 1 FROM public.bonus_transactions t WHERE t.order_id=o.id)),
 'first_created_at',min(o.created_at),
 'last_created_at',max(o.created_at)
) AS historical_orders_report
FROM public.orders o WHERE o.status='completed';
