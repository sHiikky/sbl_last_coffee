$ErrorActionPreference='Stop'
$fontFamilies = @(
 @{id='nunito';name='Nunito'}, @{id='comfortaa';name='Comfortaa'},
 @{id='mplusrounded1c';name='M PLUS Rounded 1c'}, @{id='zenmarugothic';name='Zen Maru Gothic'},
 @{id='jura';name='Jura'}, @{id='balsamiqsans';name='Balsamiq Sans'}
)
$fontRoot=Join-Path $PSScriptRoot 'fonts'
$fontSources=@()
$fontCss=@()
$fontChars=(-join (32..126 | ForEach-Object {[char]$_}))+(-join (0x410..0x44f | ForEach-Object {[char]$_}))+'Ёё₽—–«»×·'
$browserAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
foreach($fontFamily in $fontFamilies) {
 $fontSlug=$fontFamily.id
 $fontEntries=Invoke-RestMethod -Uri ('https://api.github.com/repos/google/fonts/contents/ofl/'+$fontSlug) -UserAgent 'SBL-design-preview'
 $fontFile=$fontEntries | Where-Object {$_.name.EndsWith('.ttf') -and $_.name -notmatch 'Italic'} | Sort-Object @{Expression={if($_.name.Contains('[')){0}else{1}}},@{Expression={if($_.name.Contains('Regular')){0}else{1}}},name | Select-Object -First 1
 Invoke-WebRequest -UseBasicParsing -Uri $fontFile.download_url -OutFile (Join-Path $fontRoot ($fontSlug+'.ttf'))
 foreach($fontInfoName in @('OFL.txt','METADATA.pb','upstream_info.md')){
  $fontInfo=$fontEntries | Where-Object {$_.name -eq $fontInfoName} | Select-Object -First 1
  if($fontInfo){Invoke-WebRequest -UseBasicParsing -Uri $fontInfo.download_url -OutFile (Join-Path $fontRoot ($fontSlug+'-'+$fontInfoName))}
 }
 $fontWeights=if($fontSlug -eq 'balsamiqsans'){'400;700'}else{'400;500;700'}
 $fontCssUrl='https://fonts.googleapis.com/css2?family='+[uri]::EscapeDataString($fontFamily.name)+':wght@'+$fontWeights+'&display=swap&text='+[uri]::EscapeDataString($fontChars)
 $fontResponse=Invoke-WebRequest -UseBasicParsing -Uri $fontCssUrl -UserAgent $browserAgent
 $fontStyle=[string]$fontResponse.Content
 $fontSubsets=@()
 foreach($fontMatch in [regex]::Matches($fontStyle,'@font-face\s*\{([^}]+)\}')){
  $fontBlock=$fontMatch.Groups[1].Value
  $fontUrl=[regex]::Match($fontBlock,'url\(([^)]+)\)').Groups[1].Value.Trim([char]39,[char]34)
  if(!$fontUrl.StartsWith('https://fonts.gstatic.com/')){throw 'Unexpected font host'}
  $fontWeight=[regex]::Match($fontBlock,'font-weight:\s*([^;]+)').Groups[1].Value.Trim()
  $fontFormat=if($fontBlock.Contains('woff2')){'woff2'}elseif($fontBlock.Contains('woff')){'woff'}else{'truetype'}
  $fontDest=Join-Path $fontRoot ($fontSlug+'-subset-'+$fontWeight+'.font')
  Invoke-WebRequest -UseBasicParsing -Uri $fontUrl -UserAgent $browserAgent -OutFile $fontDest
  $fontEncoded=[Convert]::ToBase64String([IO.File]::ReadAllBytes($fontDest))
  $fontCss+='@font-face{font-family:"'+$fontFamily.name+'";font-style:normal;font-weight:'+$fontWeight+';font-display:swap;src:url(data:font/'+$fontFormat+';base64,'+$fontEncoded+') format("'+$fontFormat+'");}'
  $fontSubsets+=@{weight=$fontWeight;source=$fontUrl;format=$fontFormat;file=[IO.Path]::GetFileName($fontDest)}
 }
 if($fontSubsets.Count -lt 2){throw ('Incomplete weights '+$fontSlug)}
 $fontSources+=@{id=$fontSlug;name=$fontFamily.name;source=$fontFile.html_url;license='See retained metadata and upstream license';subsets=$fontSubsets}
 Write-Output ('Downloaded '+$fontFamily.name+' with compact local Cyrillic faces')
}
$fontSources | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $fontRoot 'rounded-sources.json')
$fontCss | Set-Content -Encoding utf8 (Join-Path $PSScriptRoot 'fonts-rounded.css')
