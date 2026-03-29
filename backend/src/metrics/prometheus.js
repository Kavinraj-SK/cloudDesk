const express = require('express');
const client = require('prom-client');

const router = express.Router();
const register = new client.Registry();

client.collectDefaultMetrics({ register });

// Custom metrics
const signalingEvents = new client.Counter({
  name: 'clouddesk_signaling_events_total',
  help: 'Total signaling events',
  labelNames: ['event_type'],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: 'clouddesk_active_connections',
  help: 'Number of active WebRTC connections',
  registers: [register],
});

const sessionDuration = new client.Histogram({
  name: 'clouddesk_session_duration_seconds',
  help: 'Session duration in seconds',
  buckets: [60, 300, 600, 1800, 3600],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'clouddesk_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

function recordSignalingEvent(eventType) {
  signalingEvents.labels(eventType).inc();

  if (eventType === 'accept') activeConnections.inc();
  if (eventType === 'leave' || eventType === 'disconnect') activeConnections.dec();
}

router.get('/', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = { metricsRouter: router, recordSignalingEvent, httpRequestDuration };
