# CloudDesk Setup & Remote Control Guide

## ✨ Features

- **Screen Sharing**: Real-time P2P screen capture via WebRTC
- **Remote Control**: Full mouse & keyboard control from viewer → host (like AnyDesk)
- **Session Chat**: Real-time in-session messaging
- **Cross-Platform**: Works on Windows, macOS, Linux

---

## 🚀 Quick Start (Complete Setup)

### Prerequisites

- **Docker & Docker Compose** (for backend + databases)
- **Node.js 20+** (for local backend development)
- **Python 3.7+** (for the local control agent)
- **Modern Browser** supporting WebRTC (Chrome, Firefox, Safari, Edge)

### Option 1: Docker Compose (Recommended for local testing)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/clouddesk.git
cd clouddesk

# Start everything (backend, PostgreSQL, Redis)
docker compose up --build

# In another terminal, start the local agent (enables remote control)
python agent/clouddesk-agent.py

# Open in browser
# - Frontend: http://localhost:5173 (Vite dev server)
# - Backend API: http://localhost:4000
```

### Option 2: Manual Backend Start (Local Development)

```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev

# Terminal 2: Python Agent (enables remote control on THIS machine)
python agent/clouddesk-agent.py

# Terminal 3: Frontend
cd frontend
npm install
npm run dev

# Terminal 4: Databases (if not using Docker)
# Install PostgreSQL 16 and Redis 7
# Configure .env files (see below)
```

---

## 🔧 Configuration

### Environment Variables

#### Backend (`.env` or Docker env)

```env
# Database
DATABASE_URL=postgresql://clouddesk:password@localhost:5432/clouddesk
REDIS_URL=redis://localhost:6379

# Frontend
FRONTEND_URL=http://localhost:5173

# Server
PORT=4000
NODE_ENV=development
```

#### Frontend (`.env.local`)

```env
# Vite will expose these to the browser
VITE_API_URL=http://localhost:4000
```

---

## 🖱️ Remote Control Setup

### How It Works

```
┌──────────────────────┐
│   Viewer's Browser   │
│  (Sends mouse/keys)  │
└──────────┬───────────┘
           │ WebRTC DataChannel
           ▼
┌──────────────────────┐
│   Host's Browser     │
│                      │
└──────────┬───────────┘
           │ POST http://localhost:9009/control
           ▼
┌──────────────────────────────────────────┐
│  CloudDesk Local Agent (Python)          │
│  - Listens on localhost:9009             │
│  - Uses pyautogui to inject OS input     │
│  - Moves cursor, clicks, types keyboard  │
└──────────────────────────────────────────┘
           │
           ▼
    [Host's Operating System]
    - Mouse movement
    - Clicks (left/middle/right)
    - Keyboard input
    - Scroll wheel
```

The local agent **MUST** be running on the host machine for remote control to work.

### Installing the Agent

#### Windows

1. Install Python 3.7+ from https://www.python.org/downloads/
   - **IMPORTANT**: Check "Add Python to PATH" during installation

2. Open PowerShell or Command Prompt:
   ```powershell
   python -m pip install pyautogui
   ```

3. Start the agent:
   ```powershell
   python agent/clouddesk-agent.py
   # Or use the batch script:
   agent\start-agent.bat
   ```

#### macOS

```bash
# Install Python (if not already installed)
brew install python@3.11

# Install pyautogui
python3 -m pip install pyautogui

# Start the agent
python3 agent/clouddesk-agent.py
# Or use the shell script:
bash agent/start-agent.sh
```

#### Linux

```bash
# Install Python
sudo apt-get install python3 python3-pip

# Install pyautogui
pip3 install pyautogui

# Start the agent
python3 agent/clouddesk-agent.py
# Or use the shell script:
bash agent/start-agent.sh
```

### Verifying the Agent is Running

The agent listens on `http://localhost:9009`. To verify it's running:

```bash
# In another terminal
curl http://localhost:9009/ping

# Should return:
# {"status": "ok", "screen": [1920, 1080]}
```

The CloudDesk UI will also show **Agent: Running** (green indicator) if connected successfully.

---

## 🎮 Using Remote Control

### On the Viewer's Side (who wants to control)

1. **Enable Control**: Click the **"Control"** or **"🖱 Control ON"** button in the top bar
2. **Control is Active** when you see:
   - Red indicator showing "🖱 Remote Control Active"
   - A red cursor dot appears on the screen
3. **Interact**:
   - **Move Mouse**: Move your mouse over the remote screen
   - **Click**: Left/middle/right click
   - **Type**: Any keyboard input (Ctrl+C, Alt+Tab, etc.)
   - **Scroll**: Scroll wheel works
   - **Touch**: On mobile, touches are converted to mouse actions

### On the Host's Side

1. Make sure the **agent is running** (green indicator: "Agent: Running")
2. You'll see:
   - A **red pulsing cursor** showing where the viewer's pointer is
   - A **control log** showing the viewer's actions ("🖱 click (btn 0)", "⌨ keydown: a", etc.)
3. **The viewer can now**:
   - Move your cursor
   - Click applications
   - Type in text fields
   - Use keyboard shortcuts (Ctrl+C, Alt+Tab, etc.)
   - Scroll through documents

---

## ⚠️ Troubleshooting

### "Remote control not working"

**Check these in order:**

1. **Is the agent running?**
   - Look at the Host's screen sharing card
   - If "Agent: Not running" (yellow) or "Agent: Checking..." (gray)
   - The agent must be started manually (see above)

2. **Is the agent accessible?**
   ```bash
   curl http://localhost:9009/ping
   # Should return {"status": "ok", "screen": [...]}
   ```

3. **Is remote control enabled on the viewer's side?**
   - Click the **"Control"** button (should turn red/active)

4. **Check browser console for errors**
   - Press F12 in the browser
   - Look for any red errors in the Console tab

### "Agent not running" warning persists

**Solutions:**

1. Manually start the agent and check for errors:
   ```bash
   python agent/clouddesk-agent.py
   ```

2. Verify Python installation:
   ```bash
   python --version
   python -m pip list | grep pyautogui
   # If not found, install: python -m pip install pyautogui
   ```

3. Check if port 9009 is in use:
   ```bash
   # Windows:
   netstat -ano | findstr :9009
   # Mac/Linux:
   lsof -i :9009
   ```

### Mouse events sent but cursor doesn't move

- The agent might not have permission (especially on macOS)
- **macOS users**: Grant access to Terminal in System Preferences → Security & Privacy → Accessibility

### Keyboard input not working

1. Make sure the video element has focus (click the remote screen first)
2. Try pressing a simple key first (not Ctrl+Alt combinations)
3. Check if the app you're controlling responds to keyboard input

### Connection keeps dropping

- Check your network (especially if using a VPN)
- Try the **"Reconnect"** button in the UI
- Look at backend logs: `docker compose logs backend` or `npm run dev` output

---

## 📦 Production Deployment

### Docker Deployment (Recommended)

```yaml
# docker-compose.yml example
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "4000:4000"
    environment:
      DATABASE_URL: postgresql://clouddesk:password@postgres:5432/clouddesk
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: clouddesk
      POSTGRES_USER: clouddesk
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Important for Production:

1. **Each HOST machine needs its own agent** running locally
   - The viewer can control any host that has the agent running
   - Deploy agent alongside your CloudDesk browser

2. **Security Considerations**:
   - The agent runs on `localhost:9009` — only accessible locally
   - Use HTTPS for the web interface in production
   - Implement authentication/authorization before allowing control

3. **Kubernetes Deployment**:
   - See `k8s/deployment.yml` for Kubernetes YAML
   - Agent must run on each node (DaemonSet or per-pod)

---

## 🔐 Security Notes

- **The agent only listens on localhost** — not exposed to the internet by default
- **Session control** requires explicit host approval (accept/reject connection)
- **Data is encrypted** in transit (WebRTC uses DTLS-SRTP)
- **No third-party servers** — peer-to-peer connection after signaling

For production, consider:
- Implementing API authentication
- Using VPN/SSH tunneling for remote access to the agent
- Logging all remote control sessions
- Rate limiting for the signaling server

---

## 📖 API Endpoints

### GraphQL
- `POST /graphql` — Apollo GraphQL queries and mutations

### Signaling (WebSocket)
- `WS /` — Socket.io for WebRTC signaling

### Utilities
- `GET /health` — Server health check
- `GET /agent-status` — Check if local agent is reachable
- `GET /metrics` — Prometheus metrics

---

## 📚 Project Structure

```
clouddesk/
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   └── SessionRoom.jsx    (Main UI with control handlers)
│   │   └── hooks/
│   │       └── useWebRTC.js       (WebRTC P2P logic)
│   └── package.json
├── backend/           # Node.js + Express
│   ├── src/
│   │   ├── signaling/ (Socket.io signaling)
│   │   ├── graphql/   (GraphQL API)
│   │   └── db/        (PostgreSQL + Redis)
│   └── package.json
├── agent/             # Python local control agent
│   ├── clouddesk-agent.py   (Main agent)
│   ├── start-agent.sh       (Unix/Mac launcher)
│   ├── start-agent.bat      (Windows launcher)
│   └── start-agent.js       (Node.js launcher)
└── docker-compose.yml
```

---

## 🆘 Still Having Issues?

1. **Check the logs**:
   ```bash
   docker compose logs -f backend
   # or
   npm run dev  # shows backend logs
   ```

2. **Browser console** (F12 > Console tab):
   - WebRTC errors
   - Data channel errors
   - Network errors

3. **Python agent console output**:
   - Look for `[Agent]` messages
   - Check for `Event error` messages

4. **Network issues**:
   - Ensure WebRTC isn't blocked by firewall
   - Try disabling VPN temporarily
   - Check that port 4000 and 9009 are accessible

---

## 📝 Next Steps

- Deploy frontend to GitHub Pages or Netlify
- Deploy backend to Railway, Render, or AWS
- Configure custom domain and HTTPS
- Set up monitoring with Prometheus + Grafana
- Implement user authentication/authorization

Enjoy your remote desktop platform! 🚀
