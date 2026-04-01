# CloudDesk Quick Reference

## 🚀 Getting Started (30 seconds)

### Windows
```batch
start-clouddesk.bat
```

### macOS / Linux
```bash
bash start-clouddesk.sh
```

### Manual (All Platforms)
```bash
docker compose up --build
# In another terminal:
python agent/clouddesk-agent.py
```

Then open → http://localhost:5173

---

## 🎮 Using Remote Desktop

### Viewer (Person Controlling)
1. **Get the Host's Desk ID** → Note it down
2. **Enter Desk ID** → Click "Connect"
3. **Wait for acceptance** → Host clicks "Accept"
4. **Click "Control" button** (top bar)
5. **Control the remote PC**:
   - 🖱️ Move mouse, click buttons
   - ⌨️ Type, use keyboard shortcuts (Ctrl+C, Alt+Tab, etc.)
   - 🔄 Scroll documents
   - 👆 Double-tap for right-click (mobile)

### Host (Person Sharing)
1. **Start backend** → `docker compose up --build`
2. **Start agent** → `python agent/clouddesk-agent.py`
3. **Click "Start Screen Share"**
4. **Accept incoming connections** → Click "Accept"
5. **Watch for virtual cursor** = viewer is clicking
6. **See control log** = what viewer is doing

---

## ⚙️ System Status Indicators

| Indicator | Status | Action |
|-----------|--------|--------|
| 🟢 Green Agent | Running | All good, remote control works |
| 🟡 Yellow Agent | Not running | Start: `python agent/clouddesk-agent.py` |
| ⚪ Gray Agent | Checking | Wait 5 seconds |
| 🟢 Connected | WebRTC OK | Screen sharing works |
| 🟡 Connecting | Starting | Wait for connection |
| 🔴 Disconnected | Failed | Click "Reconnect" |

---

## 🔧 Troubleshooting (Quick Fix)

### Remote control not working?

1. **Is agent running?**
   ```bash
   curl http://localhost:9009/ping
   # Should show: {"status": "ok", "screen": [...]}
   ```

2. **Start the agent**
   ```bash
   python agent/clouddesk-agent.py
   ```

3. **Python not installed?**
   ```bash
   # Windows: https://www.python.org/downloads/
   # Mac:  brew install python@3.11
   # Linux: sudo apt-get install python3
   ```

4. **pyautogui not installed?**
   ```bash
   python -m pip install pyautogui
   ```

5. **Still not working?**
   - Check browser console (F12)
   - Check agent terminal output
   - See SETUP_GUIDE.md for full troubleshooting

---

## 📋 Keyboard Shortcuts (While Controlling)

| Action | Works | Notes |
|--------|-------|-------|
| **Ctrl+C** | ✅ | Copy / Kill process |
| **Ctrl+V** | ✅ | Paste (see note below) |
| **Alt+Tab** | ✅ | Switch windows |
| **Cmd+Q** (Mac) | ✅ | Quit app |
| **Ctrl+Alt+Del** (Windows) | ✅ | Task manager |
| **Click + Drag** | ✅ | Select / Move |
| **Double-click** | ✅ | Open files |
| **Right-click** | ✅ | Context menu / Double-tap on mobile |
| **Scroll wheel** | ✅ | Scroll documents |

**Note**: Clipboard is not synced → copy/paste needs manual work. See REMOTE_CONTROL.md for future improvements.

---

## 📁 Project Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Start backend + databases |
| `start-clouddesk.bat` | Windows launcher |
| `start-clouddesk.sh` | Unix/Mac launcher |
| `agent/clouddesk-agent.py` | OS input handler (Python) |
| `backend/src/index.js` | Backend with agent launcher |
| `frontend/src/components/SessionRoom.jsx` | UI and event handlers |
| `SETUP_GUIDE.md` | Complete installation guide |
| `REMOTE_CONTROL.md` | Technical documentation |
| `IMPLEMENTATION_SUMMARY.md` | What's been implemented |

---

## 🌐 Web Addresses

| Service | URL | Details |
|---------|-----|---------|
| **Frontend** | http://localhost:5173 | React app (Vite dev) |
| **Backend** | http://localhost:4000 | GraphQL + Signaling |
| **GraphQL** | http://localhost:4000/graphql | Query/mutation endpoint |
| **Agent** | http://localhost:9009 | Local control service |
| **Agent Health** | http://localhost:9009/ping | Agent status check |
| **Prometheus** | http://localhost:9090 | Metrics (if running) |
| **Grafana** | http://localhost:3001 | Dashboards (admin/admin123) |

---

## 🔐 Security Checklist

- ✅ Agent runs on **localhost only** (not exposed to internet)
- ✅ WebRTC uses **end-to-end encryption** (DTLS-SRTP)
- ✅ **No middle server** touches your data
- ✅ **Peer-to-peer only** after initial signaling
- ✅ **Host approval required** for each connection
- ✅ **No passwords** needed (simpler than AnyDesk)

---

## 📊 Performance Tips

| Tip | Impact |
|-----|--------|
| Close other apps | Smoother screen share |
| Use wired network | More stable connection |
| Reduce resolution (if needed) | Lower bandwidth |
| Close background processes | Better responsiveness |
| Disable VPN (if blocking P2P) | Fixes "can't connect" |

---

## 🆘 Still Need Help?

1. **Documentation**:
   - [SETUP_GUIDE.md](SETUP_GUIDE.md) — Full setup & troubleshooting
   - [REMOTE_CONTROL.md](REMOTE_CONTROL.md) — Technical deep-dive
   - [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) — What's implemented

2. **Check Logs**:
   ```bash
   docker compose logs -f backend  # Backend logs
   # Or just look at terminal output from python agent
   ```

3. **Browser Console**:
   - F12 → Console tab
   - Look for red errors
   - Check WebRTC status

4. **Verify Agent**:
   ```bash
   curl http://localhost:9009/ping
   # Should return JSON with screen info
   ```

---

## ✨ Features at a Glance

| Feature | Status | Keyboard | Touch | Mobile |
|---------|--------|----------|-------|--------|
| Screen Share | ✅ | N/A | N/A | ✅ Camera |
| Mouse Control | ✅ | ✅ | ✅ | ✅ |
| Keyboard | ✅ | ✅ & Hotkeys | N/A | ✅ Software KB |
| Scroll | ✅ | ✅ | ✅ | ✅ |
| Right-click | ✅ | ✅ | ✅ | ✅ Double-tap |
| Chat | ✅ | ✅ | ✅ | ✅ |
| Approval Flow | ✅ | N/A | N/A | N/A |

---

## 📞 Quick Commands

```bash
# Start everything
docker compose up --build

# Start agent (remote control)
python agent/clouddesk-agent.py

# Check agent is running
curl http://localhost:9009/ping

# Install Python deps
pip install pyautogui

# Stop everything
Ctrl+C  # In the terminal

# View backend logs
docker compose logs -f backend
```

---

## 🎯 Remember

- **Agent must be running** on the host for remote control to work
- **Both must be on same network** (or use VPN)
- **Host must accept** incoming connections
- **Viewer must click "Control"** button to enable input
- **No signup needed** — just exchange Desk IDs!

---

## 🚀 That's it!

You now have a fully functional remote desktop platform. Happy sharing! 🎉
