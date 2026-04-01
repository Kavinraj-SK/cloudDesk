@echo off
REM CloudDesk Complete Launcher (Windows)
REM ======================================
REM This script starts CloudDesk with everything needed:
REM 1. Docker Compose (backend, databases)
REM 2. Python Agent (for remote control)
REM 
REM Usage: Run "start-clouddesk.bat" from the project root

echo.
echo ╔════════════════════════════════════════════════════╗
echo ║     CloudDesk Launcher - Windows                   ║
echo ║     https://github.com/YOUR_USERNAME/clouddesk     ║
echo ╚════════════════════════════════════════════════════╝
echo.

REM Check if running from project root
if not exist "docker-compose.yml" (
    echo [ERROR] docker-compose.yml not found
    echo Please run this script from the CloudDesk project root directory
    pause
    exit /b 1
)

REM Check Docker
echo [1/3] Checking Docker...
docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker not found
    echo Install from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo [OK] Docker is installed

REM Check Python
echo [2/3] Checking Python...
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
) else (
    python3 --version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set PYTHON_CMD=python3
    ) else (
        echo [WARNING] Python not found - Remote control won't work
        echo Install from: https://www.python.org/downloads/
        set PYTHON_CMD=
    )
)
if defined PYTHON_CMD (
    echo [OK] Python is installed
)

echo [3/3] Checking Agent dependencies...
if defined PYTHON_CMD (
    %PYTHON_CMD% -m pip show pyautogui >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [INFO] Installing pyautogui...
        %PYTHON_CMD% -m pip install pyautogui -q
    )
)

echo.
echo ════════════════════════════════════════════════════
echo Starting CloudDesk...
echo ════════════════════════════════════════════════════
echo.

REM Start Docker Compose in background
echo [+] Starting Docker Compose (backend, PostgreSQL, Redis)...
start "CloudDesk Docker" cmd /k docker compose up --build
timeout /t 3 /nobreak

REM Start Python Agent in background (if Python is available)
if defined PYTHON_CMD (
    echo [+] Starting CloudDesk Local Agent (for remote control)...
    start "CloudDesk Agent" cmd /k "%PYTHON_CMD% agent/clouddesk-agent.py"
) else (
    echo [!] Skipping agent (Python not found)
    echo    Remote control won't work until you start the agent manually
    echo    Run: python agent/clouddesk-agent.py
)

echo.
echo ════════════════════════════════════════════════════
echo CloudDesk is starting! 🚀
echo ════════════════════════════════════════════════════
echo.
echo Frontend (Vite):     http://localhost:5173
echo Backend API:        http://localhost:4000
echo GraphQL:            http://localhost:4000/graphql
echo Prometheus:         http://localhost:9090
echo Grafana:            http://localhost:3001  (admin/admin123)
echo Agent Health:       http://localhost:9009/ping
echo.
echo Open two browser tabs to test:
echo   1. Tab 1: Get your Desk ID
echo   2. Tab 2: Connect to Tab 1's Desk ID
echo   3. Tab 1: Accept connection
echo   4. Tab 1: Start screen share
echo   5. Tab 2: Click "Control" button for remote control
echo.
echo For detailed setup, see: SETUP_GUIDE.md
echo For troubleshooting, see: REMOTE_CONTROL.md
echo.
echo Press any key to continue...
pause
