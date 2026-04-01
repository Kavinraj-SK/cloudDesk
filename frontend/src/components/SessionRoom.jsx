import { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, MicOff, Mic, X, Maximize2, Minimize2, MessageSquare, Send, PhoneOff, ScreenShare, Camera, RefreshCw } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { formatDeskId } from '../utils/deskId';

export default function SessionRoom({ deskId, session, onEnd, onNotify }) {
  const { roomId, role, remoteDeskId } = session;
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [controlEnabled, setControlEnabled] = useState(false);
  const [hostControlEnabled, setHostControlEnabled] = useState(false); // HOST can control VIEWER
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 }); // viewer-side custom cursor
  const [hostCursorPos, setHostCursorPos] = useState({ x: -100, y: -100 }); // host-side custom cursor
  const chatEndRef = useRef(null); // auto-scroll anchor
  // Local agent (clouddesk-agent.py) connection status
  // The agent runs on the HOST's machine and executes OS-level mouse/keyboard events
  const [agentStatus, setAgentStatus] = useState('unchecked'); // 'unchecked'|'online'|'offline'
  const agentCheckRef = useRef(null);
  const AGENT_URL = 'http://localhost:9009';

  // Virtual cursor state (shown on HOST when viewer sends control events)
  const [virtualCursor, setVirtualCursor] = useState(null); // { x, y } in %
  const virtualCursorTimerRef = useRef(null);

  // Remote control log overlay (shows host what the viewer's input was)
  const [controlLog, setControlLog] = useState('');
  const controlLogTimerRef = useRef(null);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  // Throttle mouse-move to ~60fps to avoid flooding the WebRTC data channel
  const pendingMoveRef = useRef(null);
  const lastMovePos = useRef(null);
  const { socket, emit, on } = useSocket();

  const {
    connectionState,
    isMuted,
    isMobileDevice,
    startScreenShare,
    stopScreenShare,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    sendControlEvent,
    sendRemoteControl,
    toggleMute,
  } = useWebRTC({
    socket,
    roomId,
    role,
    onRemoteStream: (stream) => {
      console.log('[SessionRoom] Remote stream received, tracks:', stream.getTracks().length);
      setRemoteStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Mobile browsers require explicit play() call after srcObject set
        videoRef.current.play().catch((err) => {
          console.warn('[SessionRoom] video.play() error:', err.message);
        });
      }
    },

    // BOTH SIDES: Receive control events from the remote peer via WebRTC data channel.
    // Events are forwarded to the local CloudDesk agent (clouddesk-agent.py)
    // running on localhost:9009, which uses pyautogui to execute OS input.
    // 
    // For bidirectional control BOTH machines must run:
    //   python terraform/agent/clouddesk-agent.py
    onDataMessage: (data) => {
      if (!data) {
        console.warn('[Control] Received empty data message');
        return;
      }

      console.log(`[Control] ${role.toUpperCase()} received event:`, data.type, data.event);

      // ── Forward to local OS agent ─────────────────────────────────────────
      // Both HOST and VIEWER forward to their local agent at localhost:9009
      // This enables bidirectional control
      fetch('http://localhost:9009/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then((response) => {
          if (!response.ok) {
            console.error(`[Control] Agent error (status ${response.status})`);
            setAgentStatus('offline');
          } else {
            console.log(`[Control] ${role.toUpperCase()} agent executed:`, data.type, data.event);
            setAgentStatus('online');
          }
          return response.json().catch(() => null);
        })
        .catch((err) => {
          console.error('[Host] Agent error:', err.message);
          setAgentStatus('offline');
        });

      // ── Virtual cursor (HOST sees where viewer's pointer is) ──────────────
      if (data.type === 'mouse' && (data.event === 'move' || data.event === 'click' || data.event === 'mousedown')) {
        setVirtualCursor({ x: data.x * 100, y: data.y * 100 });
        clearTimeout(virtualCursorTimerRef.current);
        virtualCursorTimerRef.current = setTimeout(() => setVirtualCursor(null), 3000);
      }
      if (data.type === 'touch' && data.event === 'touchstart') {
        setVirtualCursor({ x: data.x * 100, y: data.y * 100 });
        clearTimeout(virtualCursorTimerRef.current);
        virtualCursorTimerRef.current = setTimeout(() => setVirtualCursor(null), 2000);
      }

      // ── Control log overlay ───────────────────────────────────────────────
      let logMsg = '';
      if (data.type === 'mouse') logMsg = `🖱 ${data.event}${data.event === 'click' ? ` (btn ${data.button})` : ''}`;
      if (data.type === 'key') logMsg = `⌨ ${data.event}: ${data.key}`;
      if (data.type === 'touch') logMsg = `👆 ${data.event}`;
      if (data.type === 'scroll') logMsg = `↕ scroll ${data.deltaY > 0 ? '▼' : '▲'}`;
      if (logMsg) {
        setControlLog(logMsg);
        clearTimeout(controlLogTimerRef.current);
        controlLogTimerRef.current = setTimeout(() => setControlLog(''), 1500);
      }
    },
  });

  // ── Session Timer ────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Socket Listeners ─────────────────────────────
  useEffect(() => {
    const c1 = on('webrtc-offer', async ({ offer }) => {
      console.log('[SessionRoom] Got offer, role:', role);
      if (role === 'viewer') await handleOffer(offer);
    });
    const c2 = on('webrtc-answer', async ({ answer }) => {
      console.log('[SessionRoom] Got answer, role:', role);
      if (role === 'host') await handleAnswer(answer);
    });
    const c3 = on('ice-candidate', async ({ candidate }) => {
      await handleIceCandidate(candidate);
    });
    const c4 = on('peer-disconnected', () => {
      onNotify('Remote peer disconnected', 'error');
      onEnd();
    });
    const c5 = on('peer-left', () => {
      onNotify('Remote peer left the session', 'info');
      onEnd();
    });
    const c6 = on('chat-message', ({ message, senderDeskId, timestamp }) => {
      setMessages((prev) => [...prev, { message, senderDeskId, timestamp, own: senderDeskId === deskId }]);
    });
    // room-ready fires after accept-connection so both peers know the room is set up.
    // Viewer side uses this to confirm they're in the room before WebRTC negotiation.
    const c7 = on('room-ready', ({ roomId: readyRoom }) => {
      console.log('[SessionRoom] room-ready received for room:', readyRoom);
    });
    return () => { c1(); c2(); c3(); c4(); c5(); c6(); c7(); };
  }, [role, handleOffer, handleAnswer, handleIceCandidate]);

  // ── Auto-start screen share if host ─────────────
  useEffect(() => {
    if (role === 'host') beginScreenShare();
  }, []);

  // ── Attach remote stream to video el ────────────
  // In case video mounts after stream arrives OR if srcObject changed
  useEffect(() => {
    if (!remoteStream || !videoRef.current) return;
    
    videoRef.current.srcObject = remoteStream;
    
    // Ensure video plays — critical for iOS Safari
    videoRef.current
      .play()
      .catch((err) => {
        console.error('[SessionRoom] video.play() failed:', err);
        onNotify(`Video playback failed: ${err.message}`, 'error');
      });
  }, [remoteStream, onNotify]);

  const beginScreenShare = async () => {
    try {
      const stream = await startScreenShare();
      setLocalStream(stream);
      setIsSharing(true);
      onNotify(isMobileDevice ? '📷 Camera sharing started' : '🖥 Screen sharing started', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        onNotify('Permission denied — please allow screen/camera access', 'error');
        onEnd();
      } else {
        onNotify('Failed to start sharing: ' + err.message, 'error');
      }
    }
  };

  const handleEndSession = () => {
    stopScreenShare();
    emit('leave-room', { roomId });
    onEnd();
  };

  const handleReconnect = async () => {
    onNotify('Reconnecting…', 'info');
    stopScreenShare();
    await new Promise((r) => setTimeout(r, 800));
    await beginScreenShare();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => { });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // ── Remote Control: Get relative position ───────
  const getRelativePos = (clientX, clientY) => {
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      console.warn('[SessionRoom] Video dimensions invalid for position calc:', rect);
      return null;
    }
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  // ── Mouse Events (viewer on desktop) ────────────
  const handleMouseMove = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    
    const pos = getRelativePos(e.clientX, e.clientY);
    if (!pos) {
      console.warn('[SessionRoom] Failed to calculate mouse position');
      return;
    }

    // Skip duplicate positions (no actual movement)
    const last = lastMovePos.current;
    if (last && last.x === pos.x && last.y === pos.y) return;
    lastMovePos.current = pos;

    // RAF throttle — send at most once per animation frame (~16ms / 60fps)
    // This prevents flooding the WebRTC data channel on fast mouse moves
    if (pendingMoveRef.current) {
      cancelAnimationFrame(pendingMoveRef.current);
    }
    // Update local cursor dot position immediately (before RAF) for smooth visual
    setCursorPos({ x: e.clientX, y: e.clientY });

    pendingMoveRef.current = requestAnimationFrame(() => {
      pendingMoveRef.current = null;
      if (controlEnabled && role === 'viewer') {
        sendControlEvent({ type: 'mouse', event: 'move', ...pos });
      }
    });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleMouseClick = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    const pos = getRelativePos(e.clientX, e.clientY);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'click', button: e.button, ...pos });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleMouseDown = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    const pos = getRelativePos(e.clientX, e.clientY);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'mousedown', button: e.button, ...pos });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleMouseUp = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    const pos = getRelativePos(e.clientX, e.clientY);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'mouseup', button: e.button, ...pos });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleWheel = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    sendControlEvent({ type: 'scroll', event: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleKeyDown = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    sendControlEvent({
      type: 'key',
      event: 'keydown',
      key: e.key,
      code: e.code,
      modifiers: { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
    });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleKeyUp = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    sendControlEvent({
      type: 'key',
      event: 'keyup',
      key: e.key,
      code: e.code,
    });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  // ── Touch Events (viewer on mobile) ─────────────
  const getTouchRelativePos = (touch) => getRelativePos(touch.clientX, touch.clientY);

  const lastTouchTimeRef = useRef(0);
  const lastTouchPosRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getTouchRelativePos(touch);
    if (!pos) return;

    // Detect double-tap for right-click
    const now = Date.now();
    const lastTime = lastTouchTimeRef.current;
    const lastPos = lastTouchPosRef.current;
    const doubleTapThreshold = 300; // milliseconds
    const distanceThreshold = 50; // pixels
    
    const isDoubleTap = 
      lastPos &&
      lastTime &&
      (now - lastTime) < doubleTapThreshold &&
      Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < distanceThreshold;

    if (isDoubleTap) {
      // Double-tap = right-click
      sendControlEvent({ type: 'mouse', event: 'click', button: 2, ...pos });
      lastTouchTimeRef.current = 0;
      lastTouchPosRef.current = null;
    } else {
      // Single touch starts = left mouse down
      sendControlEvent({ type: 'touch', event: 'touchstart', ...pos, touches: e.touches.length });
      lastTouchTimeRef.current = now;
      lastTouchPosRef.current = pos;
    }
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleTouchMove = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getTouchRelativePos(touch);
    if (!pos) return;
    sendControlEvent({ type: 'touch', event: 'touchmove', ...pos });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  const handleTouchEnd = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer' || !remoteStream) return;
    e.preventDefault();
    sendControlEvent({ type: 'touch', event: 'touchend', touches: e.changedTouches.length });
  }, [controlEnabled, role, remoteStream, sendControlEvent]);

  // Focus container and set up keyboard listeners when HOST control is activated
  useEffect(() => {
    if (!hostControlEnabled || role !== 'host') return;
    
    if (containerRef.current) {
      containerRef.current.focus();
    }
    
    // Add keyboard event listeners
    const handleKeyDown = (e) => {
      console.log('[HOST] Key down:', e.key);
      handleHostKeyDown(e);
    };
    
    const handleKeyUp = (e) => {
      if (!hostControlEnabled) return;
      console.log('[HOST] Key up:', e.key);
      sendHostControlEvent({
        type: 'key',
        event: 'keyup',
        key: e.key,
        code: e.code,
      });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hostControlEnabled, role, handleHostKeyDown, sendHostControlEvent]);

  // Focus video element when viewer control is activated (needed for keyboard events)
  useEffect(() => {
    if (controlEnabled && videoRef.current) {
      videoRef.current.focus();
    }
  }, [controlEnabled]);

  // ── Agent health-check (HOST only) ───────────────
  // Polls localhost:9009/ping every 5 seconds to show agent online/offline status
  useEffect(() => {
    if (role !== 'host') return;
    const checkAgent = () => {
      fetch('http://localhost:9009/ping', { signal: AbortSignal.timeout(1500) })
        .then((r) => r.ok ? setAgentStatus('online') : setAgentStatus('offline'))
        .catch(() => setAgentStatus('offline'));
    };
    checkAgent(); // immediate first check
    agentCheckRef.current = setInterval(checkAgent, 5000);
    return () => clearInterval(agentCheckRef.current);
  }, [role]);

  // ── Auto-scroll chat to bottom on new message ───
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Increment unread badge when panel is closed ───
  useEffect(() => {
    if (!chatOpen && messages.length > 0) {
      // Only count messages we didn't send ourselves
      const last = messages[messages.length - 1];
      if (last && !last.own) setUnreadCount((n) => n + 1);
    }
  }, [messages]);

  // ── Clear unread when panel opens ────────────────
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  // ── Chat ─────────────────────────────────────────
  const sendMessage = () => {
    if (!chatInput.trim()) return;
    emit('chat-message', { roomId, message: chatInput, senderDeskId: deskId });
    setMessages((prev) => [...prev, { message: chatInput, senderDeskId: deskId, timestamp: Date.now(), own: true }]);
    setChatInput('');
  };

  // ── Helpers ──────────────────────────────────────
  const formatTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── HOST: Send Remote Control Event to VIEWER ───
  // When HOST enables control, they can click/type to control the VIEWER's machine
  const sendHostControlEvent = useCallback((eventData) => {
    if (!eventData || !sendRemoteControl) return;
    
    console.log('[HOST] Sending control to VIEWER:', eventData.type, eventData.event);
    sendRemoteControl(eventData);
    
    // Visual feedback - show what key was pressed
    if (!eventData.type.match(/mouse/)) {
      setControlLog(`🖱 ${eventData.event}${eventData.event === 'click' ? ` (btn ${eventData.button})` : ''}`);
      setTimeout(() => setControlLog(''), 1500);
    }
  }, [sendRemoteControl]);

  // HOST: Mouse handlers for controlling VIEWER
  const handleHostMouseClick = useCallback((e) => {
    if (!hostControlEnabled || role !== 'host') return;
    console.log('[HOST] Sending click to VIEWER');
    sendHostControlEvent({
      type: 'mouse',
      event: 'click',
      button: e.button,
      x: Math.random() * 0.5 + 0.25, // simulation since host doesn't see viewer video
      y: Math.random() * 0.5 + 0.25
    });
  }, [hostControlEnabled, role, sendHostControlEvent]);

  const handleHostKeyDown = useCallback((e) => {
    if (!hostControlEnabled || role !== 'host') return;
    e.preventDefault();
    sendHostControlEvent({
      type: 'key',
      event: 'keydown',
      key: e.key,
      code: e.code,
      modifiers: { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
    });
  }, [hostControlEnabled, role, sendHostControlEvent]);

  const stateColor = {
    connected: 'text-green-400',
    connecting: 'text-yellow-400',
    failed: 'text-red-400',
    disconnected: 'text-red-400',
    idle: 'text-dark-400',
  }[connectionState] || 'text-dark-400';

  const isFailed = connectionState === 'failed' || connectionState === 'disconnected';

  return (
    <div className="flex flex-col h-full bg-dark-950" ref={containerRef}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-900 border-b border-dark-800 z-10 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <div className={`status-dot ${connectionState === 'connected' ? 'online' : 'connecting'}`} />
            <span className={`text-xs font-medium capitalize ${stateColor}`}>{connectionState}</span>
          </div>
          <div className="h-4 w-px bg-dark-700 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-dark-400">
            <Monitor className="w-3.5 h-3.5" />
            <span className="font-mono">{formatDeskId(remoteDeskId)}</span>
          </div>
          <div className="h-4 w-px bg-dark-700 hidden sm:block" />
          <div className="text-xs text-dark-400 font-mono">{formatTime(elapsed)}</div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute (host only) */}
          {role === 'host' && (
            <button
              onClick={toggleMute}
              className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {/* Control VIEWER (host only) - two-way control */}
          {role === 'host' && (
            <button
              onClick={() => setHostControlEnabled(!hostControlEnabled)}
              className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 px-3 ${hostControlEnabled ? 'bg-blue-900/20 text-blue-400 border border-blue-900/40' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
              title="Control Viewer's Machine"
            >
              <ScreenShare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{hostControlEnabled ? 'Viewer Control ON' : 'Control Viewer'}</span>
            </button>
          )}

          {/* Remote Control toggle (viewer only) */}
          {role === 'viewer' && (
            <button
              onClick={() => setControlEnabled(!controlEnabled)}
              className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 px-3 ${controlEnabled ? 'bg-brand-red/20 text-brand-red border border-brand-red/30' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
              title="Toggle Remote Control"
            >
              <ScreenShare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{controlEnabled ? 'Host Control ON' : 'Host Control'}</span>
            </button>
          )}

          {/* Reconnect button (shown when failed) */}
          {isFailed && role === 'host' && (
            <button
              onClick={handleReconnect}
              className="p-2 rounded-lg bg-yellow-900/40 hover:bg-yellow-900/70 text-yellow-400 border border-yellow-900/50 px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5"
              title="Reconnect"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reconnect</span>
            </button>
          )}

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`p-2 rounded-lg transition-colors relative ${chatOpen ? 'bg-dark-600 text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
            title="Chat"
          >
            <MessageSquare className="w-4 h-4" />
            {unreadCount > 0 && !chatOpen && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors hidden sm:block" title="Fullscreen">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleEndSession}
            className="flex items-center gap-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-400 border border-red-900/50 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">End</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
          {role === 'viewer' ? (
            <>
              {/* Remote Video */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={false}
                className="max-w-full max-h-full object-contain select-none"
                style={{ cursor: controlEnabled ? 'none' : 'default' }}
                onMouseMove={handleMouseMove}
                onClick={handleMouseClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                tabIndex={controlEnabled ? 0 : -1}
              />

              {/* Custom cursor dot — follows mouse on viewer side when control is ON */}
              {controlEnabled && (
                <div
                  className="pointer-events-none fixed z-50"
                  style={{
                    left: cursorPos.x,
                    top: cursorPos.y,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* Outer ring */}
                  <div className="absolute w-5 h-5 rounded-full border-2 border-brand-red opacity-70 -translate-x-1/2 -translate-y-1/2" />
                  {/* Centre dot */}
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-red -translate-x-1/2 -translate-y-1/2 relative" />
                </div>
              )}

              {/* Control active banner */}
              {controlEnabled && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-brand-red/90 text-white text-xs px-3 py-1 rounded-full pointer-events-none z-10">
                  🖱 Remote Control Active — click/tap the screen to interact
                </div>
              )}

              {/* Waiting state (no remote stream yet) */}
              {!remoteStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-dark-500 pointer-events-none">
                  <div className="relative">
                    <Monitor className="w-16 h-16 text-dark-700" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-dark-900 border border-dark-700 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-dark-400">Waiting for screen share…</p>
                    <p className="text-xs text-dark-600 mt-1">The host needs to start sharing their screen</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* HOST side — sharing status card */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-dark-500 p-4">
              <div className="p-6 rounded-2xl border border-dark-700 bg-dark-900/80 text-center max-w-sm w-full">
                {isMobileDevice ? (
                  <Camera className="w-12 h-12 text-brand-red mx-auto mb-4" />
                ) : (
                  <ScreenShare className="w-12 h-12 text-brand-red mx-auto mb-4" />
                )}
                <h3 className="text-white font-semibold text-lg mb-2">
                  {isSharing
                    ? (isMobileDevice ? 'Camera Sharing Active' : 'Screen Sharing Active')
                    : (isMobileDevice ? 'Start Camera Share' : 'Start Screen Share')}
                </h3>
                <p className="text-dark-400 text-sm mb-4">
                  {isSharing
                    ? `Viewer ${formatDeskId(remoteDeskId)} can see your ${isMobileDevice ? 'camera' : 'screen'}`
                    : `Share your ${isMobileDevice ? 'camera' : 'screen'} with the remote viewer`}
                </p>
                {isSharing ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Broadcasting
                    </div>
                    <div className={`text-xs font-mono px-3 py-1.5 rounded-lg ${isFailed ? 'bg-red-900/30 text-red-400' : 'bg-dark-800 text-dark-400'}`}>
                      WebRTC: {connectionState}
                    </div>

                    {/* Local agent status — required for remote control to work */}
                    <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${agentStatus === 'online'
                        ? 'bg-green-900/20 text-green-400 border-green-900/40'
                        : agentStatus === 'offline'
                          ? 'bg-yellow-900/20 text-yellow-400 border-yellow-900/40'
                          : 'bg-dark-800 text-dark-500 border-dark-700'
                      }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${agentStatus === 'online' ? 'bg-green-400' : agentStatus === 'offline' ? 'bg-yellow-400 animate-pulse' : 'bg-dark-600'
                        }`} />
                      Agent: {agentStatus === 'online' ? 'Running' : agentStatus === 'offline' ? 'Not running' : 'Checking…'}
                    </div>

                    {/* Warn host if agent is offline — remote control won't work without it */}
                    {agentStatus === 'offline' && (
                      <div className="text-xs text-yellow-300/80 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2 text-left leading-relaxed">
                        <strong>Remote control needs the local agent.</strong>
                        <br />Run <code className="bg-black/30 px-1 rounded">python agent/clouddesk-agent.py</code> on this machine.
                      </div>
                    )}

                    {isFailed && (
                      <button onClick={handleReconnect} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                        <RefreshCw className="w-4 h-4" />
                        Reconnect
                      </button>
                    )}
                  </div>
                ) : (
                  <button onClick={beginScreenShare} className="btn-primary w-full">
                    {isMobileDevice ? 'Start Camera' : 'Start Screen Share'}
                  </button>
                )}

              </div>

              {/* Control action log shown on host */}
              {controlLog && (
                <div className="bg-dark-800 border border-dark-700 text-dark-300 text-xs px-3 py-1.5 rounded-full animate-fade-in">
                  {controlLog}
                </div>
              )}

              {/* Virtual cursor received from viewer — covers the FULL host view area,
                  not clipped inside the card, so it tracks any position on screen */}
              {virtualCursor && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div
                    className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75"
                    style={{ left: `${virtualCursor.x}%`, top: `${virtualCursor.y}%` }}
                  >
                    <div className="w-full h-full rounded-full bg-brand-red border-2 border-white opacity-80 animate-ping absolute" />
                    <div className="w-full h-full rounded-full bg-brand-red border-2 border-white opacity-90 relative" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Virtual cursor overlay on viewer side video (red dot = viewer's own cursor) */}
          {/* The host gets the virtual cursor on their card above (shows where viewer clicked) */}
        </div>

        {/* Chat Panel */}
        {chatOpen && (
          <div className="w-64 sm:w-72 border-l border-dark-800 bg-dark-900 flex flex-col">
            <div className="px-4 py-3 border-b border-dark-800 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-dark-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 ? (
                <div className="text-center text-dark-600 text-xs mt-8">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No messages yet</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={`${msg.senderDeskId}-${msg.timestamp}-${i}`} className={`flex flex-col gap-1 ${msg.own ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-dark-600 font-mono">{formatDeskId(msg.senderDeskId)}</span>
                    <div className={`px-3 py-2 rounded-xl text-sm max-w-[85%] ${msg.own ? 'bg-brand-red text-white rounded-tr-sm' : 'bg-dark-700 text-dark-100 rounded-tl-sm'}`}>
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
              {/* Invisible anchor — scrolled into view when messages update */}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-dark-800 flex gap-2">
              <input
                type="text"
                className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 outline-none focus:border-dark-500 placeholder-dark-600"
                placeholder="Type a message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage} className="p-2 bg-brand-red hover:bg-brand-orange rounded-lg transition-colors">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}