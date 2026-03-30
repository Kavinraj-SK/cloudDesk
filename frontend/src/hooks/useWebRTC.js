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
  const dataChannelRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const iceRestartTimerRef = useRef(null);

  const [connectionState, setConnectionState] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isMobileDevice] = useState(isMobile());

  // ── Setup Data Channel ──────────────────────────
  const setupDataChannel = useCallback((channel) => {
    dataChannelRef.current = channel;
    channel.onopen = () => console.log('[WebRTC] Data channel open');
    channel.onclose = () => console.log('[WebRTC] Data channel closed');
    channel.onerror = (e) => console.warn('[WebRTC] Data channel error:', e);
    channel.onmessage = (event) => {
      if (onDataMessage) {
        try {
          onDataMessage(JSON.parse(event.data));
        } catch (e) { /* ignore parse errors */ }
      }
    };
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

    // Receive data channel (viewer side)
    pc.ondatachannel = (event) => {
      console.log('[WebRTC] Data channel received');
      setupDataChannel(event.channel);
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

      // Create data channel BEFORE offer (must be done on offerer side)
      const dc = pc.createDataChannel('control', { ordered: true });
      setupDataChannel(dc);

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
  const sendControlEvent = useCallback((eventData) => {
    if (dataChannelRef.current?.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify(eventData));
      } catch (e) {
        console.warn('[WebRTC] sendControlEvent error:', e.message);
      }
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
      try { dataChannelRef.current.close(); } catch (_) {}
      dataChannelRef.current = null;
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