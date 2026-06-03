@echo off
chcp 65001 >nul 2>nul
title 文献译读 - 一键启动
cd /d "%~dp0"

if not exist "node_modules\vite\bin\vite.js" (
  echo 尚未安装依赖，请先双击「一键安装.bat」
  pause
  exit /b 1
)

echo 正在启动翻译引擎和网站（会打开两个黑窗口，请勿关闭）...
echo.

start "文献译读-翻译引擎" cmd /k "cd /d "%~dp0" && call "%~dp0启动翻译引擎.bat""
timeout /t 3 /nobreak >nul
start "文献译读-网站" cmd /k "cd /d "%~dp0" && call "%~dp0启动网站.bat""

echo.
echo 已启动。若浏览器未自动打开，请访问 http://localhost:5173
echo 顶栏显示「翻译引擎 · 已就绪」即可使用。
echo.
pause
