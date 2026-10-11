$ErrorActionPreference='Stop'
$OutputEncoding=New-Object Text.UTF8Encoding($false)
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migration=[IO.File]::ReadAllText((Join-Path $root 'supabase/migrations/20261005170000_bonus_hardening.sql'))
$start=$migration.IndexOf('UPDATE public.orders o SET bonus_settled_at=')
$end=$migration.IndexOf(';',$start)
if ($start -lt 0 -or $end -lt 0) { throw 'Missing migration backfill statement.' }
$backfill=$migration.Substring($start,$end-$start+1)
$fixture=@'
BEGIN;
ALTER TABLE public.orders DISABLE TRIGGER orders_z_bonus_settle_insert;
DO $$
DECLARE u uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.orders(id,customer_id,total,status) VALUES(o,u,5010,'completed');
 PERFORM set_config('historical.test.order',o::text,true);
 PERFORM set_config('historical.test.user',u::text,true);
 IF EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u) THEN
  RAISE EXCEPTION 'TEST_FAILED: fixture already has bonus account';
 END IF;
END $$;
ALTER TABLE public.orders ENABLE TRIGGER orders_z_bonus_settle_insert;
-- Reproduce the pre-hardening backfill on installed schema, transactionally.
ALTER TABLE public.orders DISABLE TRIGGER orders_status_bonus_trigger;
'@
$checks=@'
ALTER TABLE public.orders ENABLE TRIGGER orders_status_bonus_trigger;
DO $$
DECLARE o uuid:=current_setting('historical.test.order')::uuid;
 u uuid:=current_setting('historical.test.user')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=o AND bonus_settled_at IS NOT NULL
  AND bonus_cash_paid=0 AND bonus_earned_original=0) THEN
  RAISE EXCEPTION 'TEST_FAILED: historical unaccounted cash snapshot';
 END IF;
 UPDATE public.orders SET status='ready' WHERE id=o;
 UPDATE public.orders SET status='completed' WHERE id=o;
 UPDATE public.orders SET status='cancelled' WHERE id=o;
 UPDATE public.orders SET status='cancelled' WHERE id=o;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id=u AND balance=0 AND debt=0 AND lifetime_paid=0)
 OR EXISTS(SELECT 1 FROM public.bonus_transactions WHERE order_id=o) THEN
  RAISE EXCEPTION 'TEST_FAILED: old completion paid or cancellation reversed absent cash';
 END IF;
 RAISE NOTICE 'PASS: historical completed order without account does not earn again; cancellation succeeds without fictitious cash reversal or debt';
END $$;
ROLLBACK;
'@
($fixture+"`n"+$backfill+"`n"+$checks) | docker exec -i supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
if ($LASTEXITCODE -ne 0) { throw 'Historical local check failed; transaction rolled back.' }
