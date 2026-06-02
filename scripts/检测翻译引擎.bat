@echo off
echo Checking http://127.0.0.1:5000 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5000/languages' -TimeoutSec 5 -UseBasicParsing; Write-Host 'OK - engine is running. Status:' $r.StatusCode } catch { Write-Host 'FAILED:' $_.Exception.Message; Write-Host 'Run translate-up-python.bat first and wait for [READY].' }"
echo.
pause
