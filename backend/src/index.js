require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { typeDefs } = require('./graphql/schema');
const { resolvers } = require('./graphql/resolvers');
const { setupSignaling } = require('./signaling/signalingServer');
const { connectPostgres, runMigrations } = require('./db/postgres');
const { connectRedis } = require('./db/redis');
const { metricsRouter } = require('./metrics/prometheus');

const app = express();
const httpServer = http.createServer(app);

// Open CORS — allow any origin (Railway frontend, localhost, mobile browsers)
const corsOptions = {
  origin: (origin, callback) => {
    // Allow all origins — needed for Railway dynamic URLs and mobile browsers
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(bodyParser.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'CloudDesk API' });
});

// Agent health check endpoint
app.get('/agent-status', async (req, res) => {
  try {
    const response = await fetch('http://localhost:9009/ping', { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      const data = await response.json();
      res.json({ status: 'online', agent: data });
    } else {
      res.status(503).json({ status: 'offline', reason: 'HTTP error' });
    }
  } catch (err) {
    res.status(503).json({ status: 'offline', reason: err.message });
  }
});

// Prometheus metrics
app.use('/metrics', metricsRouter);

// ─────────────────────────────────────────────────────────────────────────────
// CloudDesk Local Agent Auto-Launcher (for remote control feature)
// ─────────────────────────────────────────────────────────────────────────────
let agentProcess = null;
let agentStarted = false;

function startCloudDeskAgent() {
  if (agentStarted) return;
  agentStarted = true;

  const agentScript = path.join(__dirname, '../../agent/clouddesk-agent.py');
  
  if (!fs.existsSync(agentScript)) {
    console.warn(
      '⚠️  [CloudDesk Agent] Script not found: ' + agentScript + '\n' +
      '   Remote control will not work. Make sure the agent files exist.'
    );
    return;
  }

  // Detect Python installation
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  console.log('[CloudDesk Agent] Starting local agent for remote control...');
  
  try {
    agentProcess = spawn(pythonCmd, [agentScript], {
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: false,
      shell: true
    });

    agentProcess.on('error', (err) => {
      console.warn('[CloudDesk Agent] Failed to start:', err.message);
      console.warn('  Ensure Python is installed: https://www.python.org/downloads/');
      console.warn('  And pyautogui is available: pip install pyautogui');
    });

    agentProcess.on('exit', (code, signal) => {
      console.warn(`[CloudDesk Agent] Exited (code: ${code}, signal: ${signal})`);
      agentProcess = null;
      agentStarted = false;
      // Optionally retry after a delay
      setTimeout(startCloudDeskAgent, 5000);
    });

  } catch (err) {
    console.warn('[CloudDesk Agent] Could not spawn process:', err.message);
  }
}

async function startServer() {
  await connectPostgres();
  await runMigrations();
  await connectRedis();

  const apolloServer = new ApolloServer({ typeDefs, resolvers });
  await apolloServer.start();

  app.use(
    '/graphql',
    cors(corsOptions),
    bodyParser.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => ({ req }),
    }),
  );

  setupSignaling(httpServer);

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CloudDesk Server running on port ${PORT}`);
    console.log(`📡 GraphQL:   http://localhost:${PORT}/graphql`);
    console.log(`🔌 Signaling: ws://localhost:${PORT}`);
    console.log(`📊 Metrics:   http://localhost:${PORT}/metrics`);
    console.log(`❤️  Health:    http://localhost:${PORT}/health`);

    // Start the local agent for remote control feature
    startCloudDeskAgent();

    // ── Keep-alive self-ping (prevents sleeping on Railway/Render free tier) ──
    // Railway uses RAILWAY_PUBLIC_DOMAIN, Render uses RENDER_EXTERNAL_URL
    const SELF_URL =
      process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`
        : process.env.RENDER_EXTERNAL_URL
          ? `${process.env.RENDER_EXTERNAL_URL}/health`
          : `http://localhost:${PORT}/health`;

    console.log(`[Keep-alive] Will ping: ${SELF_URL}`);

    setInterval(async () => {
      try {
        const res = await fetch(SELF_URL);
        console.log(`[Keep-alive] Ping OK: ${res.status} @ ${new Date().toISOString()}`);
      } catch (e) {
        console.warn('[Keep-alive] Ping failed:', e.message);
      }
    }, 4 * 60 * 1000); // every 4 minutes
  });
}

startServer().catch(console.error);