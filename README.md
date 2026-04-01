# ◆ CloudDesk — Remote Desktop Platform

> A full-stack remote desktop access application built for cloud computing, powered by WebRTC for peer-to-peer screen sharing. Similar to AnyDesk — no third-party paid services required.

![CloudDesk Banner](https://img.shields.io/badge/CloudDesk-Remote%20Access-e8321a?style=for-the-badge)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-green?style=flat-square)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-20-green?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?style=flat-square)

---

## 🌐 Live Demo

Frontend → GitHub Pages: `https://YOUR_USERNAME.github.io/clouddesk`  
Backend → Docker on VPS/EC2: `https://api.yourserver.com`

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖥️ Screen Sharing | WebRTC-based P2P screen capture at up to 30fps |
| 🎮 Remote Control | Mouse & keyboard events relayed via DataChannel |
| 💬 Session Chat | Real-time in-session messaging |
| 🔐 Approval Flow | All connections require explicit host approval |
| 📊 Analytics | Prometheus metrics + Grafana dashboards |
| 🌍 Global Access | Deploy frontend to GitHub Pages free forever |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        BROWSER A (Host)                   │
│   React + TailwindCSS          WebRTC P2P ←────────────┐ │
│   Desk ID: 123 456 789                                  │ │
└────────────────────┬────────────────────────────────────┘ │
                     │ Socket.io (Signaling only)           │
                     ▼                                      │
┌──────────────────────────────────────────────────────────┐ │
│              CLOUDDESK BACKEND (Node.js + Express)        │ │
│  ┌─────────────┐  ┌───────────┐  ┌──────────────────┐   │ │
│  │  GraphQL API │  │ Signaling │  │ Prometheus /metrics│  │ │
│  │  (Apollo)   │  │(Socket.io)│  └──────────────────┘   │ │
│  └──────┬──────┘  └─────┬─────┘                         │ │
│         │               │                                │ │
│  ┌──────▼──────┐  ┌─────▼─────┐                         │ │
│  │ PostgreSQL  │  │   Redis   │                         │ │
│  │(Sessions DB)│  │  (Cache)  │                         │ │
│  └─────────────┘  └───────────┘                         │ │
└──────────────────────────────────────────────────────────┘ │
                     │ Socket.io (Signaling only)           │
                     ▼                                      │
┌──────────────────────────────────────────────────────────┐ │
│                      BROWSER B (Viewer)                   │ │
│   React + TailwindCSS          WebRTC P2P ───────────────┘ │
│   Desk ID: 987 654 321                                      │
└─────────────────────────────────────────────────────────────┘
```

**Key**: The signaling server only exchanges offer/answer/ICE metadata. Actual video data flows **directly peer-to-peer** via WebRTC (DTLS-SRTP encrypted).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TailwindCSS, Vite |
| **Backend** | Node.js 20, Express, Apollo GraphQL |
| **Real-time** | Socket.io (signaling), WebRTC (P2P media) |
| **Database** | PostgreSQL 16 (sessions), Redis 7 (active desk cache) |
| **DevOps** | Docker, Docker Compose, GitHub Actions |
| **Cloud** | AWS EC2, RDS, ElastiCache, S3 (via Terraform) |
| **K8s** | Kubernetes manifests for cluster deployment |
| **Monitoring** | Prometheus + Grafana |

---

## 🚀 Quick Start (Local — No Cloud Required)

### Prerequisites
- Docker & Docker Compose installed
- Node.js 20+ (for local dev only)
- **Python 3.7+** (for remote control feature)

### 1. Clone
```bash
git clone https://github.com/YOUR_USERNAME/clouddesk.git
cd clouddesk
```

### 2. Start everything with Docker Compose
```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 (Vite dev server) |
| Backend API | http://localhost:4000 |
| GraphQL | http://localhost:4000/graphql |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin123) |

### 3. Start the local agent (for remote control)
```bash
# In a new terminal
python agent/clouddesk-agent.py

# Or Windows:
agent\start-agent.bat
```

This agent must be running for remote control to work (like AnyDesk's desktop service).

### 4. Test the connection
1. Open **two browser tabs** at `http://localhost:5173`
2. Note your **Desk ID** in Tab 1 (e.g., `123 456 789`)
3. In Tab 2, enter Tab 1's Desk ID → **Connect**
4. Tab 1 receives an incoming connection → click **Accept**
5. Tab 1 clicks **Start Screen Share** → Tab 2 sees the stream ✅
6. Tab 2 clicks **Control** → Tab 2 can now control Tab 1's mouse/keyboard ✅

---

## 🎮 Remote Control (AnyDesk-style)

CloudDesk includes **full remote control** functionality. The viewer can control the host's:
- 🖱️ Mouse movements and clicks
- ⌨️ Keyboard input
- 🔄 Scroll wheel
- 👆 Touch events (on mobile)

**How it works**:
1. Viewer clicks the **Control** button to enable remote input
2. Control events are sent via WebRTC DataChannel
3. Host's **local agent** (Python service on localhost:9009) receives events
4. Agent uses `pyautogui` to inject real OS input

**👉 START HERE**: See [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) for a complete overview of what's been implemented and how to use it.

**For detailed instructions**: 
- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Complete installation & troubleshooting
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Quick start (2 minutes)
- [REMOTE_CONTROL.md](REMOTE_CONTROL.md) - Technical deep-dive

---

## 🌍 Deploy to GitHub Pages (Free, Global)

### Step 1 — Enable GitHub Pages
Settings → Pages → Source: **GitHub Actions**

### Step 2 — Add Secrets
Settings → Secrets → Actions:
- `BACKEND_URL` → Your backend server URL (e.g., `http://YOUR_EC2_IP:4000`)

### Step 3 — Push to main
```bash
git add .
git commit -m "Deploy CloudDesk"
git push origin main
```

The GitHub Actions workflow will:
1. Build the React frontend
2. Deploy to GitHub Pages at `https://YOUR_USERNAME.github.io/clouddesk`
3. Build & push Docker images to GitHub Container Registry

---

## ☁️ Deploy Backend to AWS (Optional)

### Using Terraform
```bash
cd terraform
terraform init
terraform plan -var="key_pair_name=YOUR_KEY" \
               -var="db_password=STRONG_PASSWORD" \
               -var="github_username=YOUR_GH_USERNAME"
terraform apply
```

Terraform provisions: EC2 (backend) + RDS PostgreSQL + ElastiCache Redis + S3 (frontend option)

### Or manually with Docker on any VPS/EC2
```bash
# On your server:
docker pull ghcr.io/YOUR_USERNAME/clouddesk-backend:latest
docker run -d -p 4000:4000 \
  -e POSTGRES_HOST=your-rds-endpoint \
  -e POSTGRES_PASSWORD=your-password \
  -e REDIS_HOST=your-redis-endpoint \
  ghcr.io/YOUR_USERNAME/clouddesk-backend:latest
```

---

## ☸️ Kubernetes Deployment

```bash
# Edit k8s/deployment.yml — replace YOUR_USERNAME with your GitHub username
kubectl apply -f k8s/deployment.yml

# Check status
kubectl get pods -n clouddesk
kubectl get services -n clouddesk
```

---

## 📊 Monitoring

After `docker compose up`, open:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin / admin123)

Prometheus scrapes `/metrics` from the backend every 10s.  
Metrics tracked: active connections, signaling events, session durations, HTTP latency.

---

## 📂 Project Structure

```
clouddesk/
├── frontend/           # React + TailwindCSS SPA
│   ├── src/
│   │   ├── components/ # HomePage, SessionRoom
│   │   ├── hooks/      # useWebRTC, useSocket
│   │   └── utils/      # Desk ID generation
│   ├── Dockerfile
│   └── nginx.conf      # Reverse proxy for backend
│
├── backend/            # Node.js + Express + GraphQL
│   ├── src/
│   │   ├── graphql/    # Schema + Resolvers
│   │   ├── signaling/  # Socket.io WebRTC signaling
│   │   ├── db/         # PostgreSQL + Redis
│   │   └── metrics/    # Prometheus
│   └── Dockerfile
│
├── .github/workflows/  # GitHub Actions CI/CD
├── k8s/                # Kubernetes manifests
├── terraform/          # AWS infrastructure as code
├── monitoring/         # Prometheus + Grafana config
└── docker-compose.yml  # Full stack local deployment
```

---

## 🎓 Cloud Computing Concepts Demonstrated

| Concept | Implementation |
|---|---|
| **P2P Networking** | WebRTC DTLS-SRTP encrypted streams |
| **Signaling Server** | Socket.io with Redis-backed desk registry |
| **Microservices** | Separate frontend, backend, DB containers |
| **IaC** | Terraform for AWS EC2, RDS, ElastiCache, S3 |
| **Container Orchestration** | Docker Compose (dev), Kubernetes (prod) |
| **CI/CD** | GitHub Actions → Pages + GHCR |
| **Observability** | Prometheus metrics, Grafana dashboards |
| **Caching** | Redis for active session O(1) lookups |
| **Persistence** | PostgreSQL for session history |
| **CDN/Static Hosting** | GitHub Pages / AWS S3 |

---

## 📝 License

MIT — Built for educational purposes as a Cloud Computing course project.
