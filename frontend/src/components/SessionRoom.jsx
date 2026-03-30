import { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, MicOff, Mic, X, Maximize2, Minimize2, MessageSquare, Send, PhoneOff, ScreenShare, Camera } from 'lucide-react';
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

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
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
    toggleMute,
  } = useWebRTC({
    socket,
    roomId,
    role,
    onRemoteStream: (stream) => {
      setRemoteStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Mobile needs explicit play
        videoRef.current.play().catch(() => { });
      }
    },
    onDataMessage: (data) => {
      // Remote control received on host side — log only (browser can't control OS mouse)
      if (data.type === 'mouse' || data.type === 'key' || data.type === 'touch') {
        console.log('[Control] Received event:', data);
      }
    },
  });

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Socket listeners
  useEffect(() => {
    const c1 = on('webrtc-offer', async ({ offer }) => {
      if (role === 'viewer') await handleOffer(offer);
    });
    const c2 = on('webrtc-answer', async ({ answer }) => {
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
    return () => { c1(); c2(); c3(); c4(); c5(); c6(); };
  }, [role, handleOffer, handleAnswer, handleIceCandidate]);

  // Auto-start screen share if host
  useEffect(() => {
    if (role === 'host') beginScreenShare();
  }, []);

  const beginScreenShare = async () => {
    try {
      const stream = await startScreenShare();
      setLocalStream(stream);
      setIsSharing(true);
      onNotify(isMobileDevice ? 'Camera sharing started' : 'Screen sharing started', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        onNotify('Permission denied', 'error');
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => { });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // ── Remote control: Mouse events (desktop viewer) ──
  const getRelativePos = (e) => {
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseMove = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    const pos = getRelativePos(e);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'move', ...pos });
  }, [controlEnabled, role, sendControlEvent]);

  const handleMouseClick = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    const pos = getRelativePos(e);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'click', button: e.button, ...pos });
  }, [controlEnabled, role, sendControlEvent]);

  const handleMouseDown = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    const pos = getRelativePos(e);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'mousedown', button: e.button, ...pos });
  }, [controlEnabled, role, sendControlEvent]);

  const handleMouseUp = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    const pos = getRelativePos(e);
    if (!pos) return;
    sendControlEvent({ type: 'mouse', event: 'mouseup', button: e.button, ...pos });
  }, [controlEnabled, role, sendControlEvent]);

  const handleKeyDown = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    e.preventDefault();
    sendControlEvent({ type: 'key', event: 'keydown', key: e.key, code: e.code, modifiers: { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey } });
  }, [controlEnabled, role, sendControlEvent]);

  // ── Remote control: Touch events (mobile viewer) ──
  const getTouchRelativePos = (touch) => {
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height,
    };
  };

  const handleTouchStart = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getTouchRelativePos(touch);
    if (!pos) return;
    sendControlEvent({ type: 'touch', event: 'touchstart', ...pos });
  }, [controlEnabled, role, sendControlEvent]);

  const handleTouchMove = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getTouchRelativePos(touch);
    if (!pos) return;
    sendControlEvent({ type: 'touch', event: 'touchmove', ...pos });
  }, [controlEnabled, role, sendControlEvent]);

  const handleTouchEnd = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    e.preventDefault();
    sendControlEvent({ type: 'touch', event: 'touchend' });
  }, [controlEnabled, role, sendControlEvent]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    emit('chat-message', { roomId, message: chatInput, senderDeskId: deskId });
    setMessages((prev) => [...prev, { message: chatInput, senderDeskId: deskId, timestamp: Date.now(), own: true }]);
    setChatInput('');
  };

  const formatTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  const stateColor = {
    connected: 'text-green-400',
    connecting: 'text-yellow-400',
    failed: 'text-red-400',
    disconnected: 'text-red-400',
    idle: 'text-dark-400',
  }[connectionState] || 'text-dark-400';

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
          {role === 'host' && (
            <button
              onClick={toggleMute}
              className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {role === 'viewer' && (
            <button
              onClick={() => setControlEnabled(!controlEnabled)}
              className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 px-3 ${controlEnabled ? 'bg-brand-red/20 text-brand-red border border-brand-red/30' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
              title="Toggle Remote Control"
            >
              <ScreenShare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{controlEnabled ? 'Control ON' : 'Control'}</span>
            </button>
          )}

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`p-2 rounded-lg transition-colors relative ${chatOpen ? 'bg-dark-600 text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
            title="Chat"
          >
            <MessageSquare className="w-4 h-4" />
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
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={false}
                className="max-w-full max-h-full object-contain"
                style={{ cursor: controlEnabled ? 'crosshair' : 'default' }}
                onMouseMove={handleMouseMove}
                onClick={handleMouseClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onKeyDown={handleKeyDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                tabIndex={controlEnabled ? 0 : -1}
              />
              {controlEnabled && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-brand-red/90 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
                  Remote Control Active — click/tap to interact
                </div>
              )}
              {!remoteStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-dark-500">
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
                  <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Broadcasting
                  </div>
                ) : (
                  <button onClick={beginScreenShare} className="btn-primary w-full">
                    {isMobileDevice ? 'Start Camera' : 'Start Screen Share'}
                  </button>
                )}
              </div>
            </div>
          )}
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
                  <div key={i} className={`flex flex-col gap-1 ${msg.own ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-dark-600 font-mono">{formatDeskId(msg.senderDeskId)}</span>
                    <div className={`px-3 py-2 rounded-xl text-sm max-w-[85%] ${msg.own ? 'bg-brand-red text-white rounded-tr-sm' : 'bg-dark-700 text-dark-100 rounded-tl-sm'}`}>
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
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