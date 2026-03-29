const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../db/postgres');
const { getRedis } = require('../db/redis');

// Generate unique 9-digit desk ID like AnyDesk
function generateDeskId() {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

const resolvers = {
  Query: {
    getSession: async (_, { sessionId }) => {
      const pool = getPool();
      const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
      return result.rows[0] || null;
    },

    getDeskInfo: async (_, { deskId }) => {
      const redis = getRedis();
      const pool = getPool();

      // Check online status from Redis
      const onlineData = await redis.get(`desk:${deskId}:online`);
      const isOnline = !!onlineData;

      // Get session count from DB
      const result = await pool.query(
        'SELECT COUNT(*) as count FROM sessions WHERE desk_id = $1 AND status = $2',
        [deskId, 'CONNECTED']
      );

      const deskResult = await pool.query('SELECT * FROM desks WHERE desk_id = $1', [deskId]);
      const desk = deskResult.rows[0];

      return {
        deskId,
        alias: desk?.alias || null,
        isOnline,
        sessionCount: parseInt(result.rows[0].count),
      };
    },

    getSessionStats: async () => {
      const pool = getPool();
      const redis = getRedis();

      const totalSessions = await pool.query('SELECT COUNT(*) FROM sessions');
      const activeSessions = await pool.query("SELECT COUNT(*) FROM sessions WHERE status = 'CONNECTED'");
      const totalUsers = await pool.query('SELECT COUNT(*) FROM desks');
      const avgDuration = await pool.query(
        'SELECT AVG(duration) FROM sessions WHERE duration IS NOT NULL'
      );

      return {
        totalSessions: parseInt(totalSessions.rows[0].count),
        activeSessions: parseInt(activeSessions.rows[0].count),
        totalUsers: parseInt(totalUsers.rows[0].count),
        avgDuration: parseFloat(avgDuration.rows[0].avg) || 0,
      };
    },

    activeSessions: async () => {
      const pool = getPool();
      const result = await pool.query(
        "SELECT * FROM sessions WHERE status = 'CONNECTED' ORDER BY connected_at DESC"
      );
      return result.rows;
    },

    sessionHistory: async (_, { deskId }) => {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM sessions WHERE desk_id = $1 ORDER BY created_at DESC LIMIT 20',
        [deskId]
      );
      return result.rows;
    },
  },

  Mutation: {
    registerDesk: async (_, { alias }) => {
      const pool = getPool();
      const deskId = generateDeskId();

      await pool.query(
        'INSERT INTO desks (desk_id, alias, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (desk_id) DO NOTHING',
        [deskId, alias || null]
      );

      return { deskId, alias: alias || null, isOnline: false, sessionCount: 0 };
    },

    createSession: async (_, { hostDeskId }) => {
      const pool = getPool();
      const id = uuidv4();

      const result = await pool.query(
        'INSERT INTO sessions (id, desk_id, status, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
        [id, hostDeskId, 'WAITING']
      );

      return result.rows[0];
    },

    endSession: async (_, { sessionId }) => {
      const pool = getPool();
      const session = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);

      if (session.rows[0]) {
        const createdAt = new Date(session.rows[0].created_at);
        const duration = Math.floor((Date.now() - createdAt.getTime()) / 1000);

        await pool.query(
          "UPDATE sessions SET status = 'DISCONNECTED', duration = $1 WHERE id = $2",
          [duration, sessionId]
        );
      }
      return true;
    },

    updateAlias: async (_, { deskId, alias }) => {
      const pool = getPool();
      await pool.query('UPDATE desks SET alias = $1 WHERE desk_id = $2', [alias, deskId]);

      const result = await pool.query('SELECT * FROM desks WHERE desk_id = $1', [deskId]);
      const desk = result.rows[0];

      return {
        deskId,
        alias: desk.alias,
        isOnline: false,
        sessionCount: 0,
      };
    },
  },
};

module.exports = { resolvers };
