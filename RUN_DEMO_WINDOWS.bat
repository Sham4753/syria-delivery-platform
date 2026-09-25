@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Syria Delivery - Demo with Firebase Emulator

set "PROJECT_ID=demo-syria-delivery"
set "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080"
set "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
set "GCLOUD_PROJECT=%PROJECT_ID%"
set "ADMIN_PORT=5173"

where node >nul 2>nul || (echo Node.js is required.&pause&exit /b 1)
where firebase >nul 2>nul || (echo Firebase CLI is required. Run: npm install -g firebase-tools&pause&exit /b 2)
if not exist "functions\node_modules\firebase-admin" (
  echo Installing Functions dependencies...
  pushd functions
  call npm install --no-audit --no-fund
  if errorlevel 1 (popd&pause&exit /b 3)
  popd
)
if not exist "admin-dashboard\node_modules" (
  echo Installing Dashboard dependencies...
  pushd admin-dashboard
  call npm install --no-audit --no-fund
  if errorlevel 1 (popd&pause&exit /b 4)
  popd
)

echo Starting Firebase Emulator...
start "Syria Delivery - Firebase Emulator" /D "%~dp0" cmd /k "set GCLOUD_PROJECT=%PROJECT_ID%&&firebase emulators:start --project %PROJECT_ID% --only auth,firestore,functions"

echo Waiting for Firestore and Auth...
set /a WAIT=0
:wait
powershell -NoProfile -ExecutionPolicy Bypass -Command "$a=New-Object Net.Sockets.TcpClient; $b=New-Object Net.Sockets.TcpClient; try{$a.Connect('127.0.0.1',8080);$b.Connect('127.0.0.1',9099);exit 0}catch{exit 1}finally{$a.Dispose();$b.Dispose()}" >nul 2>&1
if not errorlevel 1 goto seed
set /a WAIT+=1
if !WAIT! GEQ 60 (echo Emulator did not start. Check the Firebase window.&pause&exit /b 5)
timeout /t 2 /nobreak >nul
goto wait

:seed
echo Seeding demo data...
node scripts\seed-emulator.js
if errorlevel 1 (echo Seeding failed. Check the Firebase window.&pause&exit /b 6)

echo Starting Admin Dashboard on http://localhost:%ADMIN_PORT% ...
start "Syria Delivery - Admin Dashboard" /D "%~dp0admin-dashboard" cmd /k "npm run dev -- --host 127.0.0.1 --port %ADMIN_PORT%"
timeout /t 5 /nobreak >nul
start "Syria Delivery Admin" "http://localhost:%ADMIN_PORT%"
echo.
echo جاهز. افتح لوحة الإدارة على: http://localhost:%ADMIN_PORT%
echo حساب الأدمن: admin@test.local / test123456
echo لا تستخدم localhost:3000 لهذه الشاشة.
pause
