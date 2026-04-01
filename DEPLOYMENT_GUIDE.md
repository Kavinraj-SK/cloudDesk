# CloudDesk v3.0 - Bidirectional Remote Control

## 🚀 Quick Start for Distributed Users

This is the production-ready CloudDesk application with **bidirectional remote control** - both HOST and VIEWER can control each other's machines.

---

## 📥 Installation Steps (For Any User)

### 1. **Clone the Repository**
```bash
git clone https://github.com/yourusername/clouddesk_fixed.git
cd clouddesk_fixed
```

### 2. **Backend Setup**
```bash
cd backend
npm install
npm start
```
Server runs on `http://localhost:4000`

### 3. **Frontend Setup**
```bash
cd ../frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`

### 4. **Install Python Agent (BOTH Machines)**
```bash
cd ../terraform/agent
pip install pyautogui
python clouddesk-agent.py
```
Agent runs on `http://localhost:9009`

---

## 🖥️ How to Use Bidirectional Control

### Machine A (HOST - Shares Screen):
1. Open http://localhost:5173
2. Get your **Desk ID** (e.g., `581 644 242`)
3. Click **"Start Screen Share"**
4. Share Desk ID with remote user
5. When connected, click **"Viewer Control ON" (BLUE)** to control their machine

### Machine B (VIEWER - Watches):
1. Open http://localhost:5173
2. Enter Machine A's Desk ID
3. Click **"Connect"**
4. When connected, click **"Host Control ON" (RED)** to control Screen A
5. Or wait for A to enable control and control you

---

## 🔧 System Requirements

### Each Machine Needs:
- **Node.js 16+** (for frontend/backend)
- **Python 3.8+** (for agent)
- **Modern Web Browser** (Chrome, Firefox, Edge, Safari)
- **Internet Connection** (even local LAN works)

### Python Dependencies:
```bash
pip install pyautogui
```

### For Windows:
```bash
pip install pyautogui keyboard mouse
```

---

## 🔍 Verify Setup is Working

### Test 1: Check Agent is Running
```bash
curl http://localhost:9009/ping
```
Expected response:
```json
{"status": "ok", "screen": [1920, 1080], "platform": "Windows"}
```

### Test 2: Check Frontend Connection
Open browser console (F12) and look for:
```
[Control] HOST received event: mouse click
[Control] HOST agent executed: mouse click
```

### Test 3: Test Control
1. Enable control on either side
2. Click or type
3. Watch for curl log output on the machine receiving input

---

## 📊 Architecture Overview

```
┌──────────────────────────────┐
│   Browser (Machine A)         │
│   HOST: Screen Sharer         │
│  ┌────────────────────────┐  │
│  │ WebRTC Video Stream    │  │
│  │ Control → localhost:9009│  │
│  └────────────────────────┘  │
└──────────────────────────────┘
         ↕ WebRTC ↕
┌──────────────────────────────┐
│   Browser (Machine B)         │
│   VIEWER: Screen Consumer     │
│  ┌────────────────────────┐  │
│  │ WebRTC Video Display   │  │
│  │ Control → localhost:9009│  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

---

## 🎯 Key Features

### ✅ Implemented Features
- **Bidirectional Control**: HOST ↔ VIEWER
- **Mouse Control**: Move, click, scroll
- **Keyboard Input**: Full keyboard support
- **Screen Sharing**: Desktop or Camera (mobile)
- **Chat**: Real-time messaging
- **Voice**: Audio over WebRTC
- **NAT Traversal**: TURN servers for firewall bypass
- **Session Timer**: Track connection duration
- **Agent Health Check**: Auto-detect if agent is running

### 🔄 Bidirectional Flow
1. **VIEWER clicks on video**
   - Browser captures click coordinates
   - Sends via WebRTC data channel to HOST
   - HOST forwards to `localhost:9009/control`
   - Agent executes mouse click on HOST machine

2. **HOST enables control**
   - Browser captures keyboard input globally
   - Sends via WebRTC data channel to VIEWER
   - VIEWER forwards to `localhost:9009/control`
   - Agent executes key press on VIEWER machine

---

## 🚨 Troubleshooting

### "Control not working" 
**Check 1:** Is agent running?
```bash
# On the machine being controlled:
curl http://localhost:9009/ping
# If fails: agent isn't running
python terraform/agent/clouddesk-agent.py
```

**Check 2:** Browser console for errors
```javascript
// Open DevTools (F12) and type:
document.querySelectorAll('*')  // If page loads, JS is working
```

**Check 3:** Network connectivity
- Both machines on same network? Try local IP
- Behind NAT? TURN servers should handle it
- Check firewall: localhost:9009 should be accessible

### "WebRTC connection fails"
- Check browser console for ICE errors
- Verify STUN/TURN servers (configured in useWebRTC.js)
- Try different browser (Firefox, Chrome)

### "Screen share doesn't display"
- Grant camera/screen permissions
- Wait 3-5 seconds for WebRTC negotiation
- Mobile: Use camera, not screen (iOS limitation)
- Check that video element has srcObject

---

## 📝 File Structure

```
clouddesk_fixed/
├── frontend/              # React + Vite
│   ├── src/
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js       ← Control logic
│   │   │   └── useSocket.js       ← Signaling
│   │   ├── components/
│   │   │   └── SessionRoom.jsx    ← UI & Handlers
│   │   └── ...
│   └── package.json
├── backend/               # Node.js Express
│   ├── src/
│   │   ├── graphql/      ← Desk registration
│   │   ├── signaling/    ← WebRTC signaling
│   │   ├── db/           ← Redis/PostgreSQL
│   │   └── ...
│   └── package.json
├── terraform/
│   └── agent/
│       └── clouddesk-agent.py  ← Control executor
└── README.md
```

---

## 🔐 Security Notes

- ✅ WebRTC is peer-to-peer (no central server sees video)
- ✅ Signaling uses Socket.io over HTTPS (if deployed)
- ✅ Agent only accepts from localhost (secure)
- ✅ No plain text passwords (use OAuth in production)
- ⚠️ For production: Change CORS settings in backend
- ⚠️ For production: Use proper SSL certificates

---

## 📦 Deployment

### Local Testing (Development)
```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Frontend  
cd frontend && npm run dev

# Terminal 3 (Machine A): Agent
python terraform/agent/clouddesk-agent.py

# Terminal 4 (Machine B): Agent
python terraform/agent/clouddesk-agent.py
```

### Docker Deployment (Production)
```bash
docker-compose up -d
# See docker-compose.yml for configuration
```

### Cloud Deployment (Render, Heroku, AWS)
```bash
# Backend: Deploy to cloud platform
# Frontend: Build and deploy to CDN
git push heroku main  # if using Heroku
```

---

## 🤝 Contributing

1. Fork the repository  
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🆘 Support

- **Issues**: GitHub Issues
- **Questions**: GitHub Discussions
- **Bugs**: Report with browser console logs

---

## ✅ Version History

### v3.0 (Latest) - April 1, 2026
- ✨ **NEW**: Bidirectional control (HOST ↔ VIEWER)
- 🔧 Fixed data channel race condition
- 📊 Improved logging and debugging
- 🎨 Added control buttons (Blue/Red)
- 📚 Complete setup guides

### v2.0
- WebRTC peer-to-peer streaming
- One-way remote control

### v1.0
- Initial release

---

**Last Updated**: April 1, 2026  
**Status**: Production Ready ✅
