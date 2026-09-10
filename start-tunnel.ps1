$ErrorActionPreference = "Stop"

$projectDir = "C:\Users\User\OneDrive\Desktop\Приложение проект\cranky-yellow-cheese"
$ngrokExe   = "C:\Users\User\OneDrive\Desktop\Приложение проект\ngrok3\ngrok.exe"
$qrPath     = "C:\Users\User\OneDrive\Desktop\qr-приложение.png"

Set-Location $projectDir

# Освобождаем порт 8081, если там что-то зависло с прошлого раза
$existing = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
if ($existing) {
    $existing | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

# На всякий случай останавливаем зависший ngrok с прошлого раза
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "Запускаю ngrok..."
Start-Process -FilePath $ngrokExe -ArgumentList "http 8081 --host-header=rewrite" -WindowStyle Minimized

$publicUrl = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
        if ($resp.tunnels.Count -gt 0) {
            $publicUrl = $resp.tunnels[0].public_url
            break
        }
    } catch {}
}

if (-not $publicUrl) {
    Write-Host "Не удалось получить адрес ngrok. Проверь, что ngrok авторизован (ngrok config check)."
    exit 1
}

Write-Host "Публичный адрес: $publicUrl"
$env:EXPO_PACKAGER_PROXY_URL = $publicUrl

$expUrl = $publicUrl -replace "^https://", "exp://"
node -e "require('qrcode').toFile('$($qrPath -replace '\\','\\\\')', '$expUrl', {width:500}, (e)=>{if(e){console.error(e);process.exit(1)}else{console.log('QR сохранён')}})"

Write-Host ""
Write-Host "================================================"
Write-Host "QR-код обновлён: $qrPath"
Write-Host "Ссылка для Expo Go: $expUrl"
Write-Host "================================================"
Write-Host ""

pnpm exec expo start --port 8081
