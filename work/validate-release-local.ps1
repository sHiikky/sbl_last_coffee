$ErrorActionPreference='Stop'
$OutputEncoding=New-Object Text.UTF8Encoding($false)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repo
$baseline=Join-Path $repo 'supabase/migrations/20261005123617_remote_schema.sql'
if ((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash -ne '1555E50A6155D2A58024E2A003BBD7F8560B7436A33CC94E652010C7C6F432A1') {
 throw 'Baseline changed; refusing reset.'
}
Write-Host 'LOCAL ONLY: resetting local database. Local test users/orders will be removed.'
& npx.cmd supabase db reset --local
if ($LASTEXITCODE -ne 0) { throw 'Local migration reset failed.' }
# Assert the actual installed migration history, without reading linked history.
$expected=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' | ForEach-Object { $_.BaseName.Split('_')[0] } | Sort-Object)
$actual=docker exec supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'
if ($LASTEXITCODE -ne 0) { throw 'Cannot read local migration history.' }
if (Compare-Object $expected @($actual | Where-Object { $_.Trim() })) { throw 'Local migration history mismatch.' }
Write-Host 'PASS: local migration history matches files.'
$rewardChecks=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'reward-final-checks.sql'))
("BEGIN;`n"+$rewardChecks) | docker exec -i supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
if ($LASTEXITCODE -ne 0) { throw 'Final reward regression failed.' }
foreach ($check in @('validate-price-local.ps1','validate-bonus-local.ps1','validate-historical-bonus-local.ps1','validate-availability-local.ps1','validate-security-local.ps1','concurrency-bonus-local.ps1')) {
 & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $check)
 if ($LASTEXITCODE -ne 0) { throw "Release validation failed: $check" }
}
Write-Host 'PASS: full local rebuild, migration history, reward/price/bonus/availability/security regressions and bonus concurrency.'
Write-Host 'Production unchanged. Local cashier credentials must be recreated for UI testing.'
