@echo off
REM CloudDesk Agent Start Script (Windows)
REM ========================================

setlocal enabledelayedexpansion
set AGENT_PORT=9009
set AGENT_SCRIPT=%~dp0clouddesk-agent.py
set MAX_RETRIES=3
set RETRY_COUNT=0

REM Check if Python is available
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
) else (
    python3 --version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set PYTHON_CMD=python3
    ) else (
        echo [CloudDesk Agent] Error: Python not found
        echo Install from: https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

echo [CloudDesk Agent] Using: %PYTHON_CMD%

REM Check and install dependencies
echo [CloudDesk Agent] Checking dependencies...
%PYTHON_CMD% -m pip show pyautogui >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [CloudDesk Agent] Installing pyautogui...
    %PYTHON_CMD% -m pip install pyautogui -q
    if %ERRORLEVEL% EQU 0 (
        echo [CloudDesk Agent] Dependencies installed
    ) else (
        echo [CloudDesk Agent] Failed to install dependencies
        echo Run manually: %PYTHON_CMD% -m pip install pyautogui
        pause
        exit /b 1
    )
)

REM Start the agent
if not exist "%AGENT_SCRIPT%" (
    echo [CloudDesk Agent] Script not found: %AGENT_SCRIPT%
    pause
    exit /b 1
)

:START_AGENT
echo [CloudDesk Agent] Starting on port %AGENT_PORT%...
%PYTHON_CMD% "%AGENT_SCRIPT%"
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo [CloudDesk Agent] Exited with code %EXIT_CODE%
    set /a RETRY_COUNT=!RETRY_COUNT! + 1
    
    if %RETRY_COUNT% LSS %MAX_RETRIES% (
        echo [CloudDesk Agent] Retrying... %RETRY_COUNT%/%MAX_RETRIES%
        timeout /t 2 /nobreak
        goto START_AGENT
    ) else (
        echo [CloudDesk Agent] Max retries reached
        pause
        exit /b 1
    )
)

endlocal
