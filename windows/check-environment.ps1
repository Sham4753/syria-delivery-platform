$ErrorActionPreference = 'Continue'
Write-Host '=== Syria Delivery / OpenManus environment check ===' -ForegroundColor Cyan
function Check($name, $command) {
  $cmd = Get-Command $command -ErrorAction SilentlyContinue
  if ($cmd) { Write-Host "[OK] $name -> $($cmd.Source)" -ForegroundColor Green } else { Write-Host "[MISSING] $name" -ForegroundColor Yellow }
}
Check 'Git' 'git'
Check 'Node.js' 'node'
Check 'npm' 'npm'
Check 'Flutter' 'flutter'
Check 'Firebase CLI' 'firebase'
Check 'ADB' 'adb'
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  Write-Host '[OK] WSL command available' -ForegroundColor Green
  wsl.exe --status
  wsl.exe -l -v
} else { Write-Host '[MISSING] WSL2' -ForegroundColor Yellow }
Write-Host ''
Write-Host 'Recommended: Windows 11 + WSL2 Ubuntu + Python 3.12 + Node LTS + Flutter SDK + Android Studio.'
Write-Host 'Run as Administrator only when installing missing Windows components.'
