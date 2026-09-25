@echo off
setlocal
cd /d "%~dp0.."
for /f "delims=" %%P in ('wsl.exe wslpath -a "%CD%"') do set "WSL_PROJECT=%%P"
echo Starting OpenManus for Syria Delivery...
wsl.exe bash -lc "cd '%WSL_PROJECT%/openmanus' && . .venv/bin/activate && python main.py"
if errorlevel 1 pause
