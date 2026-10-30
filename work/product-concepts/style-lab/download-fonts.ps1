$fontFamilies = @('manrope','golostext','onest','inter','nunitosans','rubik','montserrat','ibmplexsans')
$fontRoot = Join-Path $PSScriptRoot 'fonts'
$fontSources = @()
foreach ($fontSlug in $fontFamilies) {
  $fontEntries = Invoke-RestMethod -Uri ('https://api.github.com/repos/google/fonts/contents/ofl/' + $fontSlug) -UserAgent 'SBL-design-preview'
  $fontFile = $fontEntries | Where-Object { $_.name.EndsWith('.ttf') -and $_.name -notmatch 'Italic' } | Sort-Object @{Expression={if($_.name.Contains('[')){0}else{1}}},@{Expression={if($_.name.Contains('Regular')){0}else{1}}},name | Select-Object -First 1
  if (!$fontFile) { throw ('Missing font ' + $fontSlug) }
  Invoke-WebRequest -UseBasicParsing -Uri $fontFile.download_url -OutFile (Join-Path $fontRoot ($fontSlug+'.ttf'))
  foreach ($fontInfoName in @('OFL.txt','METADATA.pb')) {
    $fontInfo = $fontEntries | Where-Object { $_.name -eq $fontInfoName } | Select-Object -First 1
    Invoke-WebRequest -UseBasicParsing -Uri $fontInfo.download_url -OutFile (Join-Path $fontRoot ($fontSlug+'-'+$fontInfoName))
  }
  $fontSources += @{ id=$fontSlug; source=$fontFile.html_url; license='SIL Open Font License 1.1' }
  Write-Output ('Downloaded '+$fontSlug)
}
$fontSources | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $fontRoot 'sources.json')
