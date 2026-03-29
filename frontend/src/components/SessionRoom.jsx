import { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, MicOff, Mic, X, Maximize2, Minimize2, MessageSquare, Send, PhoneOff, Wifi, WifiOff, ScreenShare } from 'lucide-react';
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
  const [quality, setQuality] = useState('HD');

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const { socket, emit, on } = useSocket();

  // WebRTC setup
  const {
    connectionState,
    isMuted,
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
      if (videoRef.current) videoRef.current.srcObject = stream;
    },
    onDataMessage: (data) => {
      if (data.type === 'mouse' || data.type === 'key') {
        applyRemoteControl(data);
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
      if (role === 'viewer') {
        await handleOffer(offer);
      }
    });

    const c2 = on('webrtc-answer', async ({ answer }) => {
      if (role === 'host') {
        await handleAnswer(answer);
      }
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
    if (role === 'host') {
      beginScreenShare();
    }
  }, []);

  const beginScreenShare = async () => {
    try {
      const stream = await startScreenShare();
      setLocalStream(stream);
      setIsSharing(true);
      onNotify('Screen sharing started', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        onNotify('Screen share permission denied', 'error');
        onEnd();
      } else {
        onNotify('Failed to start screen share', 'error');
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
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Remote control - send mouse/keyboard events
  const handleMouseMove = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return;
    sendControlEvent({
      type: 'mouse',
      event: 'move',
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, [controlEnabled, role, sendControlEvent]);

  const handleMouseClick = useCallback((e) => {
    if (!controlEnabled || role !== 'viewer') return;
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return;
    sendControlEvent({
      type: 'mouse',
      event: 'click',
      button: e.button,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, [controlEnabled, role, sendControlEvent]);

  const applyRemoteControl = (data) => {
    // On host side: simulate events
    if (data.type === 'mouse' && data.event === 'move') {
      const x = data.x * window.screen.width;
      const y = data.y * window.screen.height;
      console.log(`[Control] Mouse move: ${x}, ${y}`);
    }
  };

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
      {/* Session Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-900 border-b border-dark-800 z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className={`status-dot ${connectionState === 'connected' ? 'online' : 'connecting'}`} />
              <span className={`text-xs font-medium capitalize ${stateColor}`}>{connectionState}</span>
            </div>
          </div>
          <div className="h-4 w-px bg-dark-700" />
          <div className="flex items-center gap-1.5 text-xs text-dark-400">
            <Monitor className="w-3.5 h-3.5" />
            <span className="font-mono">{formatDeskId(remoteDeskId)}</span>
          </div>
          <div className="h-4 w-px bg-dark-700" />
          <div className="text-xs text-dark-400 font-mono">{formatTime(elapsed)}</div>
          <div className="h-4 w-px bg-dark-700" />
          <span className="text-xs text-dark-500 bg-dark-800 px-2 py-0.5 rounded font-mono">{quality}</span>
        </div>

        {/* Controls */}
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
              <span>{controlEnabled ? 'Control ON' : 'Control'}</span>
            </button>
          )}

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`p-2 rounded-lg transition-colors ${chatOpen ? 'bg-dark-600 text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}
            title="Chat"
          >
            <MessageSquare className="w-4 h-4" />
            {messages.filter(m => !m.own).length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full" />
            )}
          </button>

          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors" title="Fullscreen">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <div className="w-px h-5 bg-dark-700" />

          <button
            onClick={handleEndSession}
            className="flex items-center gap-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-400 border border-red-900/50 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" /> End
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
                className="max-w-full max-h-full object-contain"
                style={{ cursor: controlEnabled ? 'crosshair' : 'default' }}
                onMouseMove={handleMouseMove}
                onClick={handleMouseClick}
              />
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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-dark-500">
              <div className="p-6 rounded-2xl border border-dark-700 bg-dark-900/80 text-center max-w-sm">
                <ScreenShare className="w-12 h-12 text-brand-red mx-auto mb-4" />
                <h3 className="text-white font-semibold text-lg mb-2">
                  {isSharing ? 'Screen Sharing Active' : 'Start Sharing'}
                </h3>
                <p className="text-dark-400 text-sm mb-4">
                  {isSharing
                    ? `Viewer ${formatDeskId(remoteDeskId)} can see your screen`
                    : 'Share your screen with the remote viewer'}
                </p>
                {isSharing ? (
                  <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Broadcasting
                  </div>
                ) : (
                  <button onClick={beginScreenShare} className="btn-primary w-full">
                    Start Screen Share
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        {chatOpen && (
          <div className="w-72 border-l border-dark-800 bg-dark-900 flex flex-col animate-slide-up">
            <div className="px-4 py-3 border-b border-dark-800 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Session Chat</span>
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
