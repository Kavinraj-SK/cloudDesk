const { createClient } = require('redis');

let redisClient;

async function connectRedis() {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
    });

    await redisClient.connect();
    console.log('[Redis] Connected successfully');
  } catch (err) {
    console.error('[Redis] Connection failed:', err.message);
    console.log('[Redis] Running in-memory fallback mode');
    try { redisClient.destroy(); } catch (_) { }

    // Destroy the broken client to stop infinite error/reconnect spam
    try { redisClient.destroy(); } catch (_) { }

    // In-memory fallback for development
    const store = new Map();
    const timers = new Map();

    redisClient = {
      get: async (key) => store.get(key) || null,
      set: async (key, value, opts) => {
        store.set(key, value);
        if (opts?.EX) {
          clearTimeout(timers.get(key));
          const t = setTimeout(() => store.delete(key), opts.EX * 1000);
          timers.set(key, t);
        }
        return 'OK';
      },
      del: async (key) => {
        clearTimeout(timers.get(key));
        return store.delete(key) ? 1 : 0;
      },
    };
  }
}

function getRedis() {
  return redisClient;
}

module.exports = { connectRedis, getRedis };
