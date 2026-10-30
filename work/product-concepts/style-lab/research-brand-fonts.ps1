$ErrorActionPreference='Stop'
$researchRoot=Join-Path $PSScriptRoot 'font-research'
New-Item -ItemType Directory -Force -Path $researchRoot | Out-Null
$sources=@(
 @{id='drinkit';url='https://drinkit.io/'},
 @{id='vit';url='https://vkusnoitochka.ru/'},
 @{id='vit-app';url='https://vkusnoitochka.ru/app'}
)
foreach($source in $sources) {
 try {
  $response=Invoke-WebRequest -UseBasicParsing -Uri $source.url -TimeoutSec 25 -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
  $html=[string]$response.Content
  $html | Set-Content -Encoding utf8 (Join-Path $researchRoot ($source.id+'.html'))
  Write-Output ($source.id+' HTTP '+$response.StatusCode)
  [regex]::Matches($html,'font-family\s*:[^;}]+') | ForEach-Object {$_.Value} | Sort-Object -Unique | Select-Object -First 18
  $links=[regex]::Matches($html,'href="([^"]+\.css[^"]*)"') | ForEach-Object {$_.Groups[1].Value} | Select-Object -Unique -First 8
  $index=0
  foreach($link in $links) {
   try {
    $uri=[uri]::new([uri]$source.url,$link).AbsoluteUri
    $css=[string](Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 20).Content
    $css | Set-Content -Encoding utf8 (Join-Path $researchRoot ($source.id+'-'+$index+'.css'))
    Write-Output ('CSS '+$uri)
    [regex]::Matches($css,'font-family\s*:[^;}]+') | ForEach-Object {$_.Value} | Sort-Object -Unique | Select-Object -First 16
    $index++
   }catch{Write-Output ('CSS unavailable '+$link)}
  }
 }catch{Write-Output ($source.id+' unavailable: '+$_.Exception.Message)}
}
