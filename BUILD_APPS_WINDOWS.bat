@echo off
setlocal
cd /d "%~dp0"
title Syria Delivery - Build Android Apps

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Windows PowerShell is required.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\build-apps.ps1" -App all -Mode debug
if errorlevel 1 (
  echo.
  echo BUILD FAILED. Read the error above.
  pause
  exit /b 1
)

echo.
echo APK files are ready in artifacts\android\
explorer.exe "%~dp0artifacts\android"
pause
