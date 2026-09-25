@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=4173"
set "URL=http://127.0.0.1:%PORT%/"

if not exist "admin-dashboard\dist\index.html" (
  echo [ERROR] The built dashboard is missing.
  echo Please run BUILD_WINDOWS.bat on a computer with Node.js installed.
  pause
  exit /b 2
)

where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting Syria Delivery demo at %URL%
  start "Syria Delivery Demo Server" /min cmd /c "node scripts\local-demo-server.cjs"
  timeout /t 2 /nobreak >nul
  start "Syria Delivery" "%URL%"
  echo The demo is running. Close the server window to stop it.
  exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Starting Syria Delivery demo at %URL%
  start "Syria Delivery Demo Server" /min cmd /c "python -m http.server %PORT% --bind 127.0.0.1 --directory admin-dashboard\dist"
  timeout /t 2 /nobreak >nul
  start "Syria Delivery" "%URL%"
  echo The demo is running. Close the server window to stop it.
  exit /b 0
)

echo [ERROR] Node.js or Python is required to start the local demo.
echo Install Node.js LTS from https://nodejs.org/ or Python 3 from https://www.python.org/downloads/windows/
pause
exit /b 3
