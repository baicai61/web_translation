@echo off
cd /d "%~dp0.."
chcp 65001 >nul 2>nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ========================================
echo  Local Translation Engine (CTranslate2)
echo ========================================
echo.

set "PY_EXE="

py -3.12 -c "import sys" 1>nul 2>nul
if not errorlevel 1 set "PY_EXE=py -3.12"

if not defined PY_EXE (
  py -3.11 -c "import sys" 1>nul 2>nul
  if not errorlevel 1 set "PY_EXE=py -3.11"
)

if not defined PY_EXE (
  py -3.10 -c "import sys" 1>nul 2>nul
  if not errorlevel 1 set "PY_EXE=py -3.10"
)

if not defined PY_EXE (
  echo ERROR: Python 3.10 / 3.11 / 3.12 required
  echo Download: https://www.python.org/downloads/
  pause
  exit /b 1
)

echo Using: %PY_EXE%
%PY_EXE% -X utf8 -c "import sys; print(sys.version)"
echo.

echo [0/2] Check script encoding...
%PY_EXE% -X utf8 scripts\fix_encoding.py
echo.

echo [1/2] Check local models (first run downloads ~140MB, then seconds only)...
echo NOTE: Close any OLD engine window on port 5000 before starting.
echo.
%PY_EXE% -X utf8 scripts\install_local_translate.py
if errorlevel 1 (
  echo.
  echo WARN: Local pack not fully installed; online fallback may be used.
  echo Docker option: run translate-up-docker.bat
  echo.
)

echo [2/2] Start server http://127.0.0.1:5000
echo Stopping old processes on port 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:5000" ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)
echo Wait for [READY], then set web mode to LOCAL and press F5.
echo Local mode: English ^<-^> Chinese offline.
echo DO NOT CLOSE this window.
echo.
%PY_EXE% -X utf8 scripts\lt_server.py
pause
