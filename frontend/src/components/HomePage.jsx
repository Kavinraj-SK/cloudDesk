import { useState, useEffect, useRef } from 'react';
import { Monitor, Shield, Zap, Globe, Users, Clock, Copy, Check, ArrowRight, Wifi } from 'lucide-react';
import { formatDeskId, cleanDeskId } from '../utils/deskId';
import { useSocket } from '../hooks/useSocket';

export default function HomePage({ deskId, onStartSession, onNotify }) {
  const [remoteId, setRemoteId] = useState('');
  const [copied, setCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [stats] = useState({ users: '12.4K', sessions: '3.2K', uptime: '99.9%' });
  const { socket, emit, on } = useSocket();

  // Ref so socket handlers always read the latest remoteId without stale closure
  const remoteIdRef = useRef(remoteId);
  useEffect(() => { remoteIdRef.current = remoteId; }, [remoteId]);

  useEffect(() => {
    if (!deskId) return;

    // Register immediately if already connected, otherwise wait for connect event
    const registerDesk = () => {
      console.log('[CloudDesk] Registering desk:', deskId);
      emit('register-desk', { deskId });
    };

    // Register now if socket is already up, and always re-register on (re)connect
    if (socket.current?.connected) registerDesk();
    const cReg = on('connect', registerDesk);

    const c1 = on('incoming-connection', ({ callerDeskId, roomId, callerSocketId }) => {
      console.log('[CloudDesk] Incoming connection from', callerDeskId);
      setIncomingRequest({ callerDeskId, roomId, callerSocketId });
      onNotify(`Incoming connection from ${formatDeskId(callerDeskId)}`, 'info');
    });

    // caller gets 'viewer' role — they will watch the host's screen
    const c2 = on('connection-accepted', ({ roomId }) => {
      console.log('[CloudDesk] Connection accepted, roomId:', roomId);
      setIsConnecting(false);
      onStartSession({
        roomId,
        role: 'viewer',
        remoteDeskId: cleanDeskId(remoteIdRef.current),
      });
    });

    const c3 = on('connection-rejected', ({ message }) => {
      setIsConnecting(false);
      onNotify(message || 'Connection was rejected', 'error');
    });

    const c4 = on('connection-error', ({ message }) => {
      setIsConnecting(false);
      onNotify(message || 'Connection failed', 'error');
    });

    const c5 = on('desk-not-found', ({ message }) => {
      setIsConnecting(false);
      onNotify(message || 'Desk not found or offline', 'error');
    });

    return () => { cReg(); c1(); c2(); c3(); c4(); c5(); };
  }, [deskId]);

  const copyDeskId = () => {
    navigator.clipboard.writeText(formatDeskId(deskId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onNotify('Desk ID copied!', 'success');
  };

  const connectToDesk = () => {
    const targetId = cleanDeskId(remoteId);
    if (targetId.length !== 9 || !/^\d+$/.test(targetId)) {
      onNotify('Enter a valid 9-digit Desk ID', 'error');
      return;
    }
    if (targetId === deskId) {
      onNotify("You can't connect to yourself", 'error');
      return;
    }
    console.log('[CloudDesk] Connecting to desk:', targetId, 'from:', deskId);
    setIsConnecting(true);
    emit('connect-to-desk', { targetDeskId: targetId, callerDeskId: deskId });
  };

  // The person who accepts = HOST (they share their screen)
  const acceptConnection = () => {
    if (!incomingRequest) return;
    console.log('[CloudDesk] Accepting connection, room:', incomingRequest.roomId);
    emit('accept-connection', {
      roomId: incomingRequest.roomId,
      callerSocketId: incomingRequest.callerSocketId,
    });
    onStartSession({
      roomId: incomingRequest.roomId,
      role: 'host',
      remoteDeskId: incomingRequest.callerDeskId,
    });
    setIncomingRequest(null);
  };

  const rejectConnection = () => {
    if (!incomingRequest) return;
    emit('reject-connection', { callerSocketId: incomingRequest.callerSocketId });
    setIncomingRequest(null);
    onNotify('Connection rejected', 'info');
  };

  const handleRemoteIdChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 9);
    setRemoteId(val);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b border-dark-800 bg-dark-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rotate-45 bg-brand-red rounded-sm" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
              <div className="absolute inset-[4px] rotate-45 bg-dark-900 rounded-sm" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">CloudDesk</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-dark-400">
            <div className="status-dot online" />
            <span>Online</span>
          </div>
          <div className="h-4 w-px bg-dark-700" />
          <span className="text-xs text-dark-400 font-mono">{formatDeskId(deskId)}</span>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {incomingRequest && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-8 w-full max-w-sm shadow-2xl animate-slide-up">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-brand-red/10 border border-brand-red/30 mx-auto mb-5">
                <Wifi className="w-7 h-7 text-brand-red" />
              </div>
              <h2 className="text-xl font-bold text-center text-white mb-1">Incoming Connection</h2>
              <p className="text-dark-400 text-center text-sm mb-2">Someone wants to view your screen</p>
              <div className="bg-dark-900 rounded-lg px-4 py-3 text-center mb-6">
                <span className="text-xs text-dark-500 uppercase tracking-wider block mb-1">From Desk ID</span>
                <span className="desk-id text-white">{formatDeskId(incomingRequest.callerDeskId)}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={rejectConnection} className="btn-secondary flex-1">Reject</button>
                <button onClick={acceptConnection} className="btn-primary flex-1">Accept</button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto px-6 pt-12 pb-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-dark-800 border border-dark-700 rounded-full px-4 py-1.5 text-xs text-dark-400 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              WebRTC · No 3rd Party · End-to-End Encrypted
            </div>
            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
              Remote Access,{' '}
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #e8321a, #f0612e)' }}>
                Anywhere
              </span>
            </h1>
            <p className="text-dark-400 text-lg max-w-md mx-auto">
              Connect to any computer instantly using your Desk ID. Powered by WebRTC — no plugins required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
            <div className="panel flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand-red/10 border border-brand-red/20">
                  <Monitor className="w-4 h-4 text-brand-red" />
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">Your Desk ID</h2>
                  <p className="text-dark-500 text-xs">Share this to receive connections</p>
                </div>
              </div>
              <div className="bg-dark-900 rounded-xl p-5 flex flex-col items-center gap-3 border border-dark-700">
                <span className="desk-id text-white text-3xl">{formatDeskId(deskId)}</span>
                <button onClick={copyDeskId} className="flex items-center gap-2 text-xs text-dark-400 hover:text-white transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy ID'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-dark-500 bg-dark-900/50 rounded-lg px-3 py-2">
                <Shield className="w-3.5 h-3.5 text-green-500" />
                <span>All connections require your approval</span>
              </div>
            </div>

            <div className="panel flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-dark-700 border border-dark-600">
                  <Globe className="w-4 h-4 text-dark-300" />
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">Connect to Remote</h2>
                  <p className="text-dark-500 text-xs">Enter the remote Desk ID</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 flex-1 justify-center">
                <input
                  type="text"
                  inputMode="numeric"
                  className="input-field"
                  placeholder="000 000 000"
                  value={formatDeskId(remoteId)}
                  onChange={handleRemoteIdChange}
                  onKeyDown={(e) => e.key === 'Enter' && connectToDesk()}
                  maxLength={11}
                />
                <button
                  onClick={connectToDesk}
                  disabled={isConnecting || remoteId.length < 9}
                  className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isConnecting ? (
                    <>
                      <svg className="w-4 h-4 connecting-ring" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
                      </svg>
                      Connecting…
                    </>
                  ) : (
                    <> Connect <ArrowRight className="w-4 h-4" /> </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-10">
            {[
              { icon: Users, label: 'Active Users', value: stats.users, color: 'text-blue-400' },
              { icon: Zap, label: 'Active Sessions', value: stats.sessions, color: 'text-yellow-400' },
              { icon: Clock, label: 'Uptime', value: stats.uptime, color: 'text-green-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="panel flex flex-col items-center gap-1 text-center">
                <Icon className={`w-5 h-5 ${color} mb-1`} />
                <span className="text-xl font-bold text-white">{value}</span>
                <span className="text-dark-500 text-xs">{label}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Encrypted', desc: 'All streams encrypted via DTLS-SRTP with no data stored on servers.' },
              { icon: Zap, title: 'Low Latency', desc: 'Direct P2P via WebRTC. STUN servers only for discovery — data stays peer-to-peer.' },
              { icon: Globe, title: 'Cross-Platform', desc: 'Works in any modern browser. Chrome, Firefox, Edge — no plugins or installs.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="panel">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-dark-700">
                    <Icon className="w-4 h-4 text-dark-300" />
                  </div>
                  <span className="font-semibold text-white text-sm">{title}</span>
                </div>
                <p className="text-dark-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="px-6 py-3 border-t border-dark-800 flex items-center justify-between text-xs text-dark-600">
        <span>CloudDesk v1.0 — Cloud Computing Project</span>
        <span>WebRTC · React · Node.js · PostgreSQL · Redis · Docker</span>
      </footer>
    </div>
  );
}
