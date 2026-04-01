#!/bin/bash

# CloudDesk Complete Launcher (macOS / Linux)
# ============================================
# This script starts CloudDesk with everything needed:
# 1. Docker Compose (backend, databases)
# 2. Python Agent (for remote control)
#
# Usage: ./start-clouddesk.sh or bash start-clouddesk.sh

set -e

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║     CloudDesk Launcher - Unix/Linux/macOS          ║"
echo "║     https://github.com/YOUR_USERNAME/clouddesk     ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Check if running from project root
if [ ! -f "docker-compose.yml" ]; then
    echo "[ERROR] docker-compose.yml not found"
    echo "Please run this script from the CloudDesk project root directory"
    exit 1
fi

# Check Docker
echo "[1/3] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker not found"
    echo "Install from: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo "[OK] Docker is installed"

# Check Python
echo "[2/3] Checking Python..."
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[WARNING] Python not found - Remote control won't work"
    echo "Install from: https://www.python.org/downloads/"
fi

if [ -n "$PYTHON_CMD" ]; then
    echo "[OK] Python is installed ($PYTHON_CMD)"
fi

# Check and install agent dependencies
echo "[3/3] Checking Agent dependencies..."
if [ -n "$PYTHON_CMD" ]; then
    if ! $PYTHON_CMD -m pip show pyautogui &>/dev/null; then
        echo "[INFO] Installing pyautogui..."
        $PYTHON_CMD -m pip install pyautogui -q
    fi
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "Starting CloudDesk..."
echo "════════════════════════════════════════════════════"
echo ""

# Function to start agent in background (with cleanup on exit)
start_agent() {
    if [ -z "$PYTHON_CMD" ]; then
        echo "[!] Skipping agent (Python not found)"
        echo "    Remote control won't work until you start the agent manually"
        echo "    Run: python3 agent/clouddesk-agent.py"
        return
    fi
    
    echo "[+] Starting CloudDesk Local Agent (for remote control)..."
    $PYTHON_CMD agent/clouddesk-agent.py &
    AGENT_PID=$!
    echo "    Agent PID: $AGENT_PID"
}

# Trap to kill agent on script exit
cleanup() {
    echo ""
    echo "[*] Cleaning up..."
    if [ -n "$AGENT_PID" ]; then
        kill $AGENT_PID 2>/dev/null || true
    fi
    # Docker compose will be killed when the terminal closes
}
trap cleanup EXIT INT TERM

# Start Docker Compose
echo "[+] Starting Docker Compose (backend, PostgreSQL, Redis)..."
echo "    [You can press Ctrl+C to stop everything]"
echo ""

# Start agent in background
start_agent

# Start Docker in foreground (so we can Ctrl+C to stop everything)
docker compose up --build &
DOCKER_PID=$!

echo ""
echo "════════════════════════════════════════════════════"
echo "CloudDesk is starting! 🚀"
echo "════════════════════════════════════════════════════"
echo ""
echo "Frontend (Vite):     http://localhost:5173"
echo "Backend API:        http://localhost:4000"
echo "GraphQL:            http://localhost:4000/graphql"
echo "Prometheus:         http://localhost:9090"
echo "Grafana:            http://localhost:3001  (admin/admin123)"
echo "Agent Health:       http://localhost:9009/ping"
echo ""
echo "Open two browser tabs to test:"
echo "  1. Tab 1: Get your Desk ID"
echo "  2. Tab 2: Connect to Tab 1's Desk ID"
echo "  3. Tab 1: Accept connection"
echo "  4. Tab 1: Start screen share"
echo "  5. Tab 2: Click \"Control\" button for remote control"
echo ""
echo "For detailed setup, see: SETUP_GUIDE.md"
echo "For troubleshooting, see: REMOTE_CONTROL.md"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

# Wait for Docker (blocks until Ctrl+C)
wait $DOCKER_PID 2>/dev/null || true
