$ErrorActionPreference='Stop'
$OutputEncoding=New-Object Text.UTF8Encoding($false)
function Invoke-BonusSql([string]$sql) {
 $sql | docker exec -i supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
 if ($LASTEXITCODE -ne 0) { throw 'Local bonus SQL failed.' }
}
function Invoke-BonusParallel([string]$first,[string]$second) {
 $startAt=[DateTime]::UtcNow.AddSeconds(5)
 $jobs=@()
 try {
  foreach ($sql in @($first,$second)) {
   $jobs+=Start-Job -ArgumentList $sql,$startAt -ScriptBlock {
    param($sql,$startAt)
    $OutputEncoding=New-Object Text.UTF8Encoding($false)
    while ([DateTime]::UtcNow -lt $startAt) { Start-Sleep -Milliseconds 50 }
    $sql | docker exec -i supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
    if ($LASTEXITCODE -ne 0) { throw 'Parallel bonus SQL failed.' }
   }
  }
  $null=$jobs | Wait-Job -Timeout 35
  foreach ($job in $jobs) {
   if ($job.State -ne 'Completed') { throw "Parallel test failed: $($job.State)" }
   Receive-Job -Job $job -ErrorAction Stop
  }
 } finally {
  foreach ($job in $jobs) {
   if ($job.State -eq 'Running') { Stop-Job $job }
   Remove-Job $job -Force
  }
 }
}
$u=[guid]::NewGuid().ToString()
$a=[guid]::NewGuid().ToString()
$b=[guid]::NewGuid().ToString()
$prefix="BEGIN; SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='10s';"
try {
 Invoke-BonusSql "BEGIN; INSERT INTO auth.users(id) VALUES('$u'); INSERT INTO public.bonus_accounts(customer_id,lifetime_paid) VALUES('$u',9990); INSERT INTO public.orders(id,customer_id,total,status) VALUES('$a','$u',20,'new'),('$b','$u',20,'new'); COMMIT;"
 Invoke-BonusParallel "$prefix UPDATE public.orders SET status='completed' WHERE id='$a'; SELECT pg_sleep(1); COMMIT;" "$prefix UPDATE public.orders SET status='completed' WHERE id='$b'; SELECT pg_sleep(1); COMMIT;"
 Invoke-BonusSql @"
DO `$`$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id='$u' AND balance=3 AND debt=0 AND lifetime_paid=10030)
 OR (SELECT array_agg(amount ORDER BY amount) FROM public.bonus_transactions WHERE customer_id='$u' AND type='earn') IS DISTINCT FROM ARRAY[1,2] THEN
  RAISE EXCEPTION 'TEST_FAILED: concurrent rate threshold';
 END IF;
 RAISE NOTICE 'PASS: concurrent completion uses locked lifetime, rates 5/10 percent';
END `$`$;
"@
 Invoke-BonusParallel "$prefix UPDATE public.orders SET status='cancelled' WHERE id='$a'; SELECT pg_sleep(1); COMMIT;" "$prefix UPDATE public.orders SET status='cancelled' WHERE id='$b'; SELECT pg_sleep(1); COMMIT;"
 Invoke-BonusSql @"
DO `$`$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bonus_accounts WHERE customer_id='$u' AND balance=0 AND debt=0 AND lifetime_paid=9990)
 OR (SELECT count(*) FROM public.bonus_transactions WHERE customer_id='$u' AND type='earn_reversal')<>2 THEN
  RAISE EXCEPTION 'TEST_FAILED: concurrent cancellation';
 END IF;
 RAISE NOTICE 'PASS: concurrent cancellation restores exact balance and lifetime';
END `$`$;
"@
} finally {
 Invoke-BonusSql "BEGIN; DELETE FROM public.bonus_transactions WHERE customer_id='$u'; DELETE FROM public.orders WHERE customer_id='$u'; DELETE FROM auth.users WHERE id='$u'; COMMIT;"
 Write-Host 'Local fixtures cleaned; order-number sequence may have advanced.'
}
