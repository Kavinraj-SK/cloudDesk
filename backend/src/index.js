require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
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

// Allow any localhost origin in development
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    // Allow any localhost / 127.0.0.1 port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow configured frontend URL
    const allowed = process.env.FRONTEND_URL;
    if (allowed && origin === allowed) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight
app.use(bodyParser.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'CloudDesk API' });
});

// Prometheus metrics
app.use('/metrics', metricsRouter);

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
  httpServer.listen(PORT, () => {
    console.log(`🚀 CloudDesk Server running on port ${PORT}`);
    console.log(`📡 GraphQL:   http://localhost:${PORT}/graphql`);
    console.log(`🔌 Signaling: ws://localhost:${PORT}`);
    console.log(`📊 Metrics:   http://localhost:${PORT}/metrics`);
    console.log(`❤️  Health:    http://localhost:${PORT}/health`);
  });
}

startServer().catch(console.error);
