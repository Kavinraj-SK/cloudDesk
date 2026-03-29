const { Server } = require('socket.io');
const { getRedis } = require('../db/redis');
const { recordSignalingEvent } = require('../metrics/prometheus');

// Active room/peer map in memory (also backed by Redis)
const rooms = new Map();

function setupSignaling(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
        const allowed = process.env.FRONTEND_URL;
        if (allowed && origin === allowed) return callback(null, true);
        callback(null, true); // permissive in dev — tighten for production
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[Signaling] Client connected: ${socket.id}`);
    recordSignalingEvent('connect');

    let currentDeskId = null;
    let currentRoom = null;

    // Register desk
    socket.on('register-desk', async ({ deskId }) => {
      currentDeskId = deskId;
      socket.join(`desk:${deskId}`);

      const redis = getRedis();
      await redis.set(`desk:${deskId}:online`, socket.id, { EX: 3600 });
      await redis.set(`socket:${socket.id}:desk`, deskId, { EX: 3600 });

      console.log(`[Signaling] Desk registered: ${deskId} -> ${socket.id}`);
      socket.emit('desk-registered', { deskId, socketId: socket.id });
      recordSignalingEvent('register');
    });

    // Initiate connection request
    socket.on('connect-to-desk', async ({ targetDeskId, callerDeskId }) => {
      const redis = getRedis();
      const targetSocket = await redis.get(`desk:${targetDeskId}:online`);

      if (!targetSocket) {
        socket.emit('connection-error', { message: `Desk ${targetDeskId} is not online.` });
        return;
      }

      const roomId = `room:${callerDeskId}:${targetDeskId}`;
      currentRoom = roomId;

      console.log(`[Signaling] Connection request: ${callerDeskId} -> ${targetDeskId}`);

      // Notify target desk of incoming connection request
      io.to(`desk:${targetDeskId}`).emit('incoming-connection', {
        callerDeskId,
        roomId,
        callerSocketId: socket.id,
      });

      socket.emit('connection-pending', { targetDeskId, roomId });
      recordSignalingEvent('connect-request');
    });

    // Accept connection
    socket.on('accept-connection', ({ roomId, callerSocketId }) => {
      socket.join(roomId);
      io.to(callerSocketId).emit('connection-accepted', { roomId });

      const callerSocket = io.sockets.sockets.get(callerSocketId);
      if (callerSocket) callerSocket.join(roomId);

      // Notify room members
      io.to(roomId).emit('room-ready', { roomId });
      console.log(`[Signaling] Room ready: ${roomId}`);
      recordSignalingEvent('accept');
    });

    // Reject connection
    socket.on('reject-connection', ({ callerSocketId }) => {
      io.to(callerSocketId).emit('connection-rejected', {
        message: 'Connection was rejected by the remote desk.',
      });
      recordSignalingEvent('reject');
    });

    // WebRTC Offer
    socket.on('webrtc-offer', ({ roomId, offer, targetSocketId }) => {
      console.log(`[Signaling] WebRTC offer in room ${roomId}`);
      socket.to(roomId).emit('webrtc-offer', { offer, senderSocketId: socket.id });
    });

    // WebRTC Answer
    socket.on('webrtc-answer', ({ roomId, answer }) => {
      console.log(`[Signaling] WebRTC answer in room ${roomId}`);
      socket.to(roomId).emit('webrtc-answer', { answer });
    });

    // ICE Candidates
    socket.on('ice-candidate', ({ roomId, candidate }) => {
      socket.to(roomId).emit('ice-candidate', { candidate });
    });

    // Remote control events (mouse/keyboard)
    socket.on('remote-control', ({ roomId, event }) => {
      socket.to(roomId).emit('remote-control', { event, senderSocketId: socket.id });
    });

    // Chat message
    socket.on('chat-message', ({ roomId, message, senderDeskId }) => {
      io.to(roomId).emit('chat-message', { message, senderDeskId, timestamp: Date.now() });
    });

    // Leave room / disconnect
    socket.on('leave-room', async ({ roomId }) => {
      socket.leave(roomId);
      socket.to(roomId).emit('peer-left', { socketId: socket.id });
      recordSignalingEvent('leave');
    });

    socket.on('disconnect', async () => {
      console.log(`[Signaling] Client disconnected: ${socket.id}`);
      recordSignalingEvent('disconnect');

      const redis = getRedis();
      if (currentDeskId) {
        await redis.del(`desk:${currentDeskId}:online`);
        await redis.del(`socket:${socket.id}:desk`);

        // Notify room peers
        if (currentRoom) {
          socket.to(currentRoom).emit('peer-disconnected', {
            socketId: socket.id,
            deskId: currentDeskId,
          });
        }
      }
    });
  });

  console.log('[Signaling] WebRTC Signaling Server initialized');
  return io;
}

module.exports = { setupSignaling };
