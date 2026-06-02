@echo off
cd /d "%~dp0.."

echo ========================================
echo  Translation Engine (English - Chinese)
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
  echo ERROR: Need Python 3.10, 3.11 or 3.12
  pause
  exit /b 1
)

echo Using: %PY_EXE%
%PY_EXE% -c "import sys; print(sys.version)"
echo.

echo Optional: try install local Argos (may fail on some PCs - OK)
%PY_EXE% -m pip install argostranslate==1.9.6 --no-cache-dir -q 2>nul

echo Starting http://127.0.0.1:5000
echo If local Argos fails, online fallback will be used automatically.
echo Wait for [READY], then press F5 on the web page.
echo.
%PY_EXE% scripts\lt_server.py
pause
