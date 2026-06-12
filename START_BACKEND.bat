@echo off
echo ============================================
echo  LightGuard IDS - Backend Startup
echo  Tadhamon Smart City
echo ============================================
cd /d "%~dp0"
echo Installing requirements...
pip install -r backend\requirements.txt
echo.
echo Starting Backend on http://localhost:8000
echo Press Ctrl+C to stop
echo.
python -m uvicorn backend.main:app --port 8000
pause
