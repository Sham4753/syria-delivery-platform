[CmdletBinding()]
param(
  [ValidateSet('all', 'customer', 'merchant', 'courier')]
  [string]$App = 'all',
  [ValidateSet('debug', 'release')]
  [string]$Mode = 'debug',
  [switch]$SkipAnalyze
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ArtifactRoot = Join-Path $Root 'artifacts/android'
$Apps = @{
  customer = 'customer_app'
  merchant = 'merchant_app'
  courier = 'courier_app'
}

Set-Location $Root
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter غير مثبت أو غير موجود في PATH. نفّذ flutter doctor أولًا.'
}

$Targets = if ($App -eq 'all') { @('customer', 'merchant', 'courier') } else { @($App) }
New-Item -ItemType Directory -Force -Path $ArtifactRoot | Out-Null

Write-Host "=== Syria Delivery Android build ($Mode) ===" -ForegroundColor Cyan
foreach ($Name in $Targets) {
  $Dir = Join-Path $Root $Apps[$Name]
  Push-Location $Dir
  try {
    Write-Host "[$Name] flutter pub get" -ForegroundColor Yellow
    flutter pub get
    if (-not $SkipAnalyze) {
      Write-Host "[$Name] flutter analyze" -ForegroundColor Yellow
      $AnalysisOutput = flutter analyze 2>&1
      $AnalysisOutput | ForEach-Object { Write-Host $_ }
      if ($AnalysisOutput -match '(^|\s)error •') {
        throw "[$Name] وجد flutter analyze أخطاء حقيقية."
      }
    }

    if ($Mode -eq 'debug') {
      Write-Host "[$Name] flutter build apk --debug" -ForegroundColor Yellow
      flutter build apk --debug
      $Source = Join-Path $Dir 'build/app/outputs/flutter-apk/app-debug.apk'
      $Destination = Join-Path $ArtifactRoot "$Name-debug.apk"
    } else {
      if (-not (Test-Path (Join-Path $Dir 'android/key.properties'))) {
        throw "[$Name] release يحتاج android/key.properties وأسرار توقيع. استخدم -Mode debug للتجربة."
      }
      Write-Host "[$Name] flutter build apk --release" -ForegroundColor Yellow
      flutter build apk --release
      $Source = Join-Path $Dir 'build/app/outputs/flutter-apk/app-release.apk'
      $Destination = Join-Path $ArtifactRoot "$Name-release.apk"
    }

    if (-not (Test-Path $Source)) { throw "[$Name] لم ينتج Flutter الملف المتوقع: $Source" }
    Copy-Item -Force $Source $Destination
    Write-Host "[$Name] جاهز: $Destination" -ForegroundColor Green
  } finally {
    Pop-Location
  }
}

$Manifest = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  mode = $Mode
  project = 'syria-delivery-2026-majed'
  artifacts = Get-ChildItem $ArtifactRoot -File | Select-Object Name, Length, LastWriteTime
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $ArtifactRoot 'manifest.json')
Write-Host "`nBUILD SUCCESS: $ArtifactRoot" -ForegroundColor Green
