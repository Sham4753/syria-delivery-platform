@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Syria Delivery - Vendor Diagnostics

if not exist firebase.json (
  echo ERROR: Run this file from the project root.
  pause
  exit /b 1
)
if not exist functions\node_modules\firebase-admin (
  echo Installing Cloud Functions dependencies first...
  pushd functions
  call npm install
  popd
)

echo.
echo تأكد أن نافذة الـ Emulator شغّالة (start-all.bat) قبل ما تكمل...
echo.
node scripts\diagnose-vendors.js

echo.
pause
