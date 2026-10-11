$ErrorActionPreference='Stop'
$OutputEncoding=New-Object Text.UTF8Encoding($false)
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migration=[IO.File]::ReadAllText((Join-Path $root 'supabase/migrations/20261005190000_product_availability.sql'))
$checks=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'availability-checks.sql'))
$installed=docker exec supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='is_available');"
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect local DB.' }
if (($installed -join '').Trim() -eq 't') { $sql="BEGIN;`n"+$checks }
else { $sql=$migration.Substring(0,$migration.LastIndexOf('COMMIT;'))+$checks }
$sql | docker exec -i supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
if ($LASTEXITCODE -ne 0) { throw 'Local availability check failed; transaction rolled back.' }
