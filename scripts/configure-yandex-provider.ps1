$ErrorActionPreference = 'Stop'

$projectRef = 'vxefueynagwuavlyeiqc'
$clientId = Read-Host 'Вставь Yandex OAuth Client ID'
if ([string]::IsNullOrWhiteSpace($clientId)) {
  throw 'Client ID не может быть пустым.'
}

$secretSecure = Read-Host 'Вставь Yandex Client Secret (ввод скрыт)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
$secretPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)

$failure = $null
$nodeExitCode = 1
try {
  $apiKeysJson = & supabase projects api-keys --reveal --output json --project-ref $projectRef 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось получить ключ проекта через Supabase CLI. Проверь, что CLI авторизован (supabase login).'
  }
  $apiKeys = $apiKeysJson | ConvertFrom-Json
  if ($apiKeys.api_keys) {
    $apiKeys = $apiKeys.api_keys
  }
  $serviceRoleKey = ($apiKeys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
  if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    throw 'CLI не вернул service_role key для проекта.'
  }

  $env:SUPABASE_URL = "https://$projectRef.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
  $env:YANDEX_CLIENT_ID = $clientId
  $env:YANDEX_CLIENT_SECRET = $secretPlain

  & node (Join-Path $PSScriptRoot 'configure-yandex-provider.cjs')
  $nodeExitCode = $LASTEXITCODE
  if ($nodeExitCode -ne 0) {
    $failure = 'Supabase не создал провайдера. Выше показана диагностическая ошибка.'
  }
}
catch {
  $failure = $_.Exception.Message
}

$secretPlain = $null
$serviceRoleKey = $null
$apiKeys = $null
$apiKeysJson = $null
Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:YANDEX_CLIENT_ID -ErrorAction SilentlyContinue
Remove-Item Env:YANDEX_CLIENT_SECRET -ErrorAction SilentlyContinue

if ($failure) {
  throw $failure
}
