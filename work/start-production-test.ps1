$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repo
$previousUrl=$env:EXPO_PUBLIC_SUPABASE_URL
$previousKey=$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
try {
 $env:EXPO_PUBLIC_SUPABASE_URL='https://vxefueynagwuavlyeiqc.supabase.co'
 $env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_OD1Fh_a_qhnjKeMd30RQRA_WgpOXZwq'
 Write-Host 'SBL PRODUCTION DATABASE: test orders here will be real production records.'
 & npx.cmd expo start --web --port 8083 --clear
 if ($LASTEXITCODE -ne 0) { throw 'App startup failed.' }
} finally {
 $env:EXPO_PUBLIC_SUPABASE_URL=$previousUrl
 $env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$previousKey
}
