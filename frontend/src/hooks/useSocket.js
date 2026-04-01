import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

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

  /**
   * Register a socket event listener.
   * Safe to call even before the socket is connected — the listener is attached
   * to the shared socketInstance directly (which persists across renders).
   * Returns an unsubscribe function for use in useEffect cleanups.
   */
  const on = useCallback((event, handler) => {
    // socketInstance is the module-level singleton — always available after first mount
    const sock = socketRef.current || socketInstance;
    if (sock) {
      sock.on(event, handler);
    } else {
      console.warn('[Socket] on() called before socket was initialised — event:', event);
    }
    return () => {
      const s = socketRef.current || socketInstance;
      if (s) s.off(event, handler);
    };
  }, []);

  const off = useCallback((event, handler) => {
    const sock = socketRef.current || socketInstance;
    if (sock) sock.off(event, handler);
  }, []);

  return { socket: socketRef, emit, on, off };
}