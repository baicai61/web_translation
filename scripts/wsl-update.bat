@echo off
echo Updating WSL (required for Docker Desktop)...
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command \"wsl --update; pause\"'"
echo If UAC appeared, click Yes. Then restart PC and open Docker Desktop.
pause
