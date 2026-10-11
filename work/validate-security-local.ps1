$ErrorActionPreference='Stop'
$OutputEncoding=New-Object Text.UTF8Encoding($false)
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migration=[IO.File]::ReadAllText((Join-Path $root 'supabase/migrations/20261005180000_function_security.sql'))
$checks=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'security-checks.sql'))
# Reapplying these ALTER/GRANT/REVOKE operations is intentional and transactional.
$bonusChecks=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'bonus-checks.sql'))
$sql=$migration.Substring(0,$migration.LastIndexOf('COMMIT;'))+$checks.Substring(0,$checks.LastIndexOf('ROLLBACK;'))+$bonusChecks
$sql | docker exec -i supabase_db_sbl-coffee-app-master psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
if ($LASTEXITCODE -ne 0) { throw 'Local function security check failed; transaction rolled back.' }
