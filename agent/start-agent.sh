#!/bin/bash

# CloudDesk Agent Start Script (Unix/Linux/macOS)
# ================================================

AGENT_PORT=9009
AGENT_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/clouddesk-agent.py"
MAX_RETRIES=3
RETRY_COUNT=0

# Check if Python is available
check_python() {
    if command -v python3 &> /dev/null; then
        echo "python3"
    elif command -v python &> /dev/null; then
        echo "python"
    else
        return 1
    fi
}

# Install dependencies
install_deps() {
    local python_cmd=$1
    
    echo "[CloudDesk Agent] Checking dependencies..."
    
    if ! $python_cmd -m pip show pyautogui &>/dev/null; then
        echo "[CloudDesk Agent] Installing pyautogui..."
        $python_cmd -m pip install pyautogui -q
        if [ $? -eq 0 ]; then
            echo "[CloudDesk Agent] ✓ Dependencies installed"
        else
            echo "[CloudDesk Agent] ❌ Failed to install dependencies"
            echo "Manually run: $python_cmd -m pip install pyautogui"
            exit 1
        fi
    fi
}

# Start the agent
start_agent() {
    local python_cmd=$1
    
    if [ ! -f "$AGENT_SCRIPT" ]; then
        echo "[CloudDesk Agent] Script not found: $AGENT_SCRIPT"
        exit 1
    fi
    
    echo "[CloudDesk Agent] Starting on port $AGENT_PORT..."
    $python_cmd "$AGENT_SCRIPT" &
    AGENT_PID=$!
    
    wait $AGENT_PID
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo "[CloudDesk Agent] Exited with code $exit_code"
        RETRY_COUNT=$((RETRY_COUNT + 1))
        
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "[CloudDesk Agent] Retrying... ($RETRY_COUNT/$MAX_RETRIES)"
            sleep 2
            start_agent "$python_cmd"
        else
            echo "[CloudDesk Agent] Max retries reached"
            exit 1
        fi
    fi
}

# Main
python_cmd=$(check_python)

if [ -z "$python_cmd" ]; then
    echo "[CloudDesk Agent] ❌ Python not found"
    echo "Install Python from: https://www.python.org/downloads/"
    exit 1
fi

echo "[CloudDesk Agent] Using: $python_cmd"
install_deps "$python_cmd"
start_agent "$python_cmd"
