@echo off
cd /d "%~dp0"
echo Starting Naga Parking. Keep this window open while using the app.
call npm run thesis:start
pause
