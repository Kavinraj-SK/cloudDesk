import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// Always connect directly to backend port in dev.
// In prod, set VITE_API_URL to your server URL.
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let socketInstance = null;

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!socketInstance || socketInstance.disconnected) {
      socketInstance = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        path: '/socket.io',
        withCredentials: true,
      });

      socketInstance.on('connect', () => {
        console.log('[Socket] Connected:', socketInstance.id);
      });
      socketInstance.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
      });
      socketInstance.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });
    }
    socketRef.current = socketInstance;

    return () => {
      // Keep socket alive across component re-renders
    };
  }, []);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('[Socket] Cannot emit — not connected. Event:', event);
    }
  }, []);

  const on = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, handler);
      }
    };
  }, []);

  const off = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler);
    }
  }, []);

  return { socket: socketRef, emit, on, off };
}
