import { useRef, useState, useCallback } from 'react';

// ─────────────────────────────────────────────────
// ICE Server Configuration
// Multiple STUN + diverse TURN providers for maximum
// reliability across PC↔PC, PC↔Phone, Phone↔Phone.
// ─────────────────────────────────────────────────
const ICE_SERVERS = {
  iceServers: [
    // Google STUN (always reliable)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Cloudflare STUN
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Twilio STUN
    { urls: 'stun:global.stun.twilio.com:3478' },

    // ── TURN: numb.viagenie.ca (free, no-signup, reliable) ──
    {
      urls: 'turn:numb.viagenie.ca',
      username: 'webrtc@live.com',
      credential: 'muazkh',
    },
    // ── TURN: openrelay (backup) ──
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // ── TURN over TLS (bypasses port 443 corporate firewalls) ──
    {
      urls: 'turns:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // ── TURN TCP (last resort for symmetric NATs) ──
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ─────────────────────────────────────────────────
// Device Detection
// ─────────────────────────────────────────────────
const isMobile = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// iOS Safari has limited/no getDisplayMedia support even on 15.4+
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Check screen capture API availability
const supportsDisplayMedia = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !isIOS();

// ─────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────
export function useWebRTC({ socket, roomId, role, onRemoteStream, onDataMessage }) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const dataChannelRef = useRef(null);  // reliable — clicks / keys
  const dataMoveChannelRef = useRef(null);  // unreliable — mouse move
  const pendingCandidatesRef = useRef([]);
  const iceRestartTimerRef = useRef(null);

  const [connectionState, setConnectionState] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isMobileDevice] = useState(isMobile());

  // ── Setup Data Channel(s) ───────────────────────
  // channel     = reliable channel for clicks / keys / scroll
  // moveChannel = unreliable channel for mouse-move (optional, host-side only)
  const setupDataChannel = useCallback((channel, moveChannel) => {
    dataChannelRef.current = channel;

    const attach = (ch) => {
      ch.onopen = () => console.log('[WebRTC] Data channel open:', ch.label);
      ch.onclose = () => console.log('[WebRTC] Data channel closed:', ch.label);
      ch.onerror = (e) => console.warn('[WebRTC] Data channel error:', ch.label, e);
      ch.onmessage = (event) => {
        if (onDataMessage) {
          try { onDataMessage(JSON.parse(event.data)); }
          catch (_) { /* ignore parse errors */ }
        }
      };
    };

    attach(channel);
    if (moveChannel) {
      dataMoveChannelRef.current = moveChannel;
      attach(moveChannel);
    }
  }, [onDataMessage]);

  // ── Create Peer Connection ──────────────────────
  const createPeerConnection = useCallback(() => {
    // Close any existing connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Connection state tracking
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] Connection state:', state);
      setConnectionState(state);

      // Auto ICE restart on failure (up to 3 attempts)
      if (state === 'failed') {
        console.warn('[WebRTC] Connection failed — scheduling ICE restart...');
        clearTimeout(iceRestartTimerRef.current);
        iceRestartTimerRef.current = setTimeout(async () => {
          if (pcRef.current && role === 'host') {
            try {
              console.log('[WebRTC] Attempting ICE restart...');
              const offer = await pcRef.current.createOffer({ iceRestart: true });
              await pcRef.current.setLocalDescription(offer);
              if (socket.current) {
                socket.current.emit('webrtc-offer', { roomId, offer });
              }
            } catch (err) {
              console.error('[WebRTC] ICE restart failed:', err.message);
            }
          }
        }, 2000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering:', pc.iceGatheringState);
    };

    // Trickle ICE — send candidates as they're gathered
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socket.current) {
        socket.current.emit('ice-candidate', { roomId, candidate });
      }
    };

    // Receive remote media track
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind, '| streams:', event.streams.length);
      if (onRemoteStream && event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    // Receive data channels (viewer side — may receive both 'control' and 'mouse-move')
    const receivedChannels = {};
    pc.ondatachannel = (event) => {
      const ch = event.channel;
      console.log('[WebRTC] Data channel received:', ch.label);
      receivedChannels[ch.label] = ch;
      if (receivedChannels['control']) {
        setupDataChannel(receivedChannels['control'], receivedChannels['mouse-move'] || null);
      }
    };

    return pc;
  }, [roomId, socket, onRemoteStream, role, setupDataChannel]);

  // ── HOST: Start Screen / Camera Share ──────────
  const startScreenShare = useCallback(async () => {
    try {
      setConnectionState('connecting');

      let stream;

      if (supportsDisplayMedia() && !isMobileDevice) {
        // Desktop: screen capture
        console.log('[WebRTC] Starting screen capture (desktop)');
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, max: 30 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            cursor: 'always',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
        });
      } else {
        // Mobile / iOS: use camera (rear-facing preferred)
        console.log('[WebRTC] Starting camera capture (mobile)');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      }

      localStreamRef.current = stream;
      const pc = createPeerConnection();

      // ── Two data channels (mirrors AnyDesk's approach) ────────────────
      // 'control'        — reliable, ordered  → clicks, keystrokes, scroll
      // 'mouse-move'     — unreliable, no retransmit → position updates only
      //   maxRetransmits:0 means stale move packets are dropped, not queued,
      //   which is what makes cursor movement feel instant instead of laggy.
      const dc = pc.createDataChannel('control', { ordered: true });
      const dcMove = pc.createDataChannel('mouse-move', { ordered: false, maxRetransmits: 0 });
      setupDataChannel(dc, dcMove);

      // Add all tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[WebRTC] Added track:', track.kind);
      });

      // When user stops sharing (e.g. browser's "Stop sharing" button)
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.log('[WebRTC] Track ended, stopping share');
          stopScreenShare();
        };
      });

      // Create offer — let SDP auto-negotiate (do NOT set offerToReceive flags
      // as they interfere with the direction negotiation)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('[WebRTC] Sending offer to room:', roomId);
      if (socket.current) {
        socket.current.emit('webrtc-offer', { roomId, offer });
      }

      return stream;
    } catch (err) {
      console.error('[WebRTC] startScreenShare error:', err);
      setConnectionState('failed');
      throw err;
    }
  }, [createPeerConnection, roomId, socket, isMobileDevice, setupDataChannel]);

  // ── VIEWER: Handle Incoming Offer ──────────────
  const handleOffer = useCallback(async (offer) => {
    console.log('[WebRTC] Received offer, creating answer...');
    const pc = createPeerConnection();

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Flush queued ICE candidates (may arrive before offer)
    for (const candidate of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Queued ICE candidate error:', e.message);
      }
    }
    pendingCandidatesRef.current = [];

    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log('[WebRTC] Sending answer to room:', roomId);
    if (socket.current) {
      socket.current.emit('webrtc-answer', { roomId, answer });
    }
    setConnectionState('connecting');
  }, [createPeerConnection, roomId, socket]);

  // ── HOST: Handle Answer from Viewer ────────────
  const handleAnswer = useCallback(async (answer) => {
    console.log('[WebRTC] Received answer from viewer');
    if (pcRef.current) {
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('[WebRTC] setRemoteDescription (answer) error:', err.message);
      }
    }
  }, []);

  // ── Both: Handle ICE Candidates ─────────────────
  const handleIceCandidate = useCallback(async (candidate) => {
    if (!candidate) return;
    if (pcRef.current && pcRef.current.remoteDescription) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] ICE candidate add error:', e.message);
      }
    } else {
      // Buffer candidates until remote description is ready
      console.log('[WebRTC] Buffering ICE candidate (no remote desc yet)');
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  // ── Viewer: Send Remote Control Event ──────────
  // Mouse-move → unreliable channel (drop stale packets, never queue)
  // Everything else → reliable channel (guarantee delivery)
  const sendControlEvent = useCallback((eventData) => {
    const isMove = eventData.type === 'mouse' && eventData.event === 'move';
    const channel = isMove
      ? (dataMoveChannelRef.current?.readyState === 'open' ? dataMoveChannelRef.current : dataChannelRef.current)
      : dataChannelRef.current;

    if (channel?.readyState === 'open') {
      try {
        channel.send(JSON.stringify(eventData));
      } catch (e) {
        console.warn('[WebRTC] sendControlEvent error:', e.message);
      }
    } else {
      console.warn('[WebRTC] Data channel not ready (state:', channel?.readyState || 'none', ')');
    }
  }, []);

  // ── Host: Stop Sharing ─────────────────────────
  const stopScreenShare = useCallback(() => {
    clearTimeout(iceRestartTimerRef.current);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (dataChannelRef.current) {
      try { dataChannelRef.current.close(); } catch (_) { }
      dataChannelRef.current = null;
    }
    if (dataMoveChannelRef.current) {
      try { dataMoveChannelRef.current.close(); } catch (_) { }
      dataMoveChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidatesRef.current = [];
    setConnectionState('idle');
  }, []);

  // ── Mute/Unmute Audio ─────────────────────────
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        setIsMuted(!audioTracks[0].enabled);
      }
    }
  }, []);

  return {
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
    localStream: localStreamRef,
  };
}