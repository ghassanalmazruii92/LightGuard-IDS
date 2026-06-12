@echo off
echo ============================================
echo  LightGuard IDS - Frontend Startup
echo  Tadhamon Smart City
echo ============================================
cd /d "%~dp0frontend"
echo Installing npm packages...
call npm install
echo.
echo Starting Frontend on http://localhost:5173
echo Press Ctrl+C to stop
echo.
call npm run dev
pause
