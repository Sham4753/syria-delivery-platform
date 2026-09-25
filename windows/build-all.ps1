param([switch]$SkipFlutter)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host '=== Building Syria Delivery ===' -ForegroundColor Cyan
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js/npm غير مثبت.' }
if (-not (Get-Command flutter -ErrorAction SilentlyContinue) -and -not $SkipFlutter) { throw 'Flutter غير مثبت. استخدم -SkipFlutter لبناء لوحة الأدمن فقط.' }
Push-Location admin-dashboard
npm install
npm run lint
npm run build
Pop-Location
if (-not $SkipFlutter) {
  foreach ($app in @('customer_app','courier_app','merchant_app')) {
    Push-Location $app
    flutter pub get
    flutter analyze
    flutter build web
    Pop-Location
  }
}
Write-Host 'BUILD SUCCESS: لوحة الأدمن وتطبيقات Flutter جاهزة.' -ForegroundColor Green
