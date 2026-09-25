@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Syria Delivery - One Click Launcher

rem Release processes from previous local Syria Delivery sessions.
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM dart.exe /T >nul 2>&1
taskkill /F /IM firebase.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

set "FIRESTORE_PORT=8080"
set "AUTH_PORT=9099"
set "HUB_PORT=4400"
set "ADMIN_PORT=5173"

rem Release known service ports if a stale process still owns one.
for %%P in (%FIRESTORE_PORT% %AUTH_PORT% %HUB_PORT% %ADMIN_PORT%) do (
  for /f "tokens=5" %%Q in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    if not "%%Q"=="0" taskkill /F /PID %%Q /T >nul 2>&1
  )
)

rem Choose the first free Vite port, starting at 5173.
for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=5173..5183; foreach($p in $ports){$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',$p)}catch{Write-Output $p; break}finally{$c.Dispose()}}"`) do set "ADMIN_PORT=%%P"
if not defined ADMIN_PORT set "ADMIN_PORT=5173"

echo === Syria Delivery launcher ===
for /f "tokens=1" %%N in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%N"
if not defined NODE_MAJOR (
  echo ERROR: Node.js is not installed or not on PATH.
  pause
  exit /b 1
)
if not "%NODE_MAJOR%"=="20" (
  echo WARNING: Firebase Functions targets Node.js 20; detected Node.js %NODE_MAJOR%.
)
if not exist firebase.json (
  echo ERROR: Run this file from the project root.
  pause
  exit /b 1
)
if not exist functions\node_modules\firebase-admin (
  echo Installing Cloud Functions dependencies...
  pushd functions
  call npm install
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)
if not exist admin-dashboard\node_modules (
  echo Installing Admin Dashboard dependencies...
  pushd admin-dashboard
  call npm install
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

set "FIRESTORE_EMULATOR_HOST=127.0.0.1:%FIRESTORE_PORT%"
set "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:%AUTH_PORT%"
set "GCLOUD_PROJECT=demo-syria-delivery"
set "PROJECT_ROOT=%~dp0"

start "Syria Delivery - Firebase Emulator" /D "%PROJECT_ROOT%" cmd /k "firebase emulators:start --only auth,firestore,functions"

echo Waiting for Firestore, Auth, and Functions emulators...
set /a WAIT_COUNT=0
:wait_emulator
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(%FIRESTORE_PORT%,%AUTH_PORT%,5001); foreach($p in $ports){$c=New-Object Net.Sockets.TcpClient; try {$c.Connect('127.0.0.1',$p)} catch {exit 1} finally {$c.Dispose()}}; exit 0" >nul 2>&1
if not errorlevel 1 goto emulator_ready
set /a WAIT_COUNT+=1
if !WAIT_COUNT! GEQ 45 (
  echo ERROR: Firebase Emulator did not become ready within 90 seconds.
  echo Check the Firebase Emulator window, Java, Firebase CLI, and ports %FIRESTORE_PORT%/%AUTH_PORT%/5001.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_emulator

:emulator_ready
echo Firestore, Auth, and Functions emulators are listening.
set /a SEED_COUNT=0
:seed_emulator
node scripts\seed-emulator.js
if not errorlevel 1 goto seed_ready
set /a SEED_COUNT+=1
if !SEED_COUNT! GEQ 15 (
  echo ERROR: Emulator seed failed after 15 attempts. Check Auth port %AUTH_PORT% and the Firebase Emulator window.
  pause
  exit /b 1
)
echo Emulator API is still warming up; retrying seed in 2 seconds...
timeout /t 2 /nobreak >nul
goto seed_emulator

:seed_ready
echo Emulator demo data seeded successfully.

start "Syria Delivery - Admin Dashboard" /D "%PROJECT_ROOT%admin-dashboard" cmd /k "set VITE_USE_FIREBASE_EMULATORS=true&& npm run dev -- --host 127.0.0.1 --port %ADMIN_PORT%"
timeout /t 5 /nobreak >nul
start "" "http://localhost:%ADMIN_PORT%"
start "" "http://127.0.0.1:4000"

start "Syria Delivery - Customer Flutter" /D "%PROJECT_ROOT%customer_app" cmd /k "flutter run -d chrome --web-port=3000 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1"
start "Syria Delivery - Courier Flutter" /D "%PROJECT_ROOT%courier_app" cmd /k "flutter run -d chrome --web-port=3001 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1"
start "Syria Delivery - Merchant Flutter" /D "%PROJECT_ROOT%merchant_app" cmd /k "flutter run -d chrome --web-port=3002 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1"

timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"
start "" "http://localhost:3001"
start "" "http://localhost:3002"

echo.
echo === Syria Delivery services launched ===
echo Firebase Emulator UI: http://127.0.0.1:4000
echo Admin Dashboard:      http://localhost:%ADMIN_PORT%
echo Customer Flutter:     http://localhost:3000
echo Courier Flutter:      http://localhost:3001
echo Merchant Flutter:     http://localhost:3002
echo.
echo Close each service CMD window separately when finished.
pause
