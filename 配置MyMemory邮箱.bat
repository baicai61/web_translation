@echo off
title MyMemory Email Config
cd /d "%~dp0"

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
  echo ERROR: Python 3.10+ required
  pause
  exit /b 1
)

"%PY_EXE%" scripts\configure_mymemory_email.py
exit /b %ERRORLEVEL%
