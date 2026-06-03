@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
set PYTHONUTF8=1

set "PY_EXE="
py -3.12 -c "import sys" 1>nul 2>nul && set "PY_EXE=py -3.12"
if not defined PY_EXE py -3.11 -c "import sys" 1>nul 2>nul && set "PY_EXE=py -3.11"
if not defined PY_EXE py -3.10 -c "import sys" 1>nul 2>nul && set "PY_EXE=py -3.10"
if not defined PY_EXE (
  echo Python 3.10+ required. Run YiJianAnZhuang.bat first.
  pause
  exit /b 1
)

echo Repairing scripts/*.py encoding...
%PY_EXE% -X utf8 scripts\fix_encoding.py
echo.
echo Done. Now run QiDongFanYiYinQing.bat / 启动翻译引擎.bat
pause
