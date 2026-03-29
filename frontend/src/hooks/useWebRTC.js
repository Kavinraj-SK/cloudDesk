import { useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTC({ socket, roomId, role, onRemoteStream, onDataMessage }) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const dataChannelRef = useRef(null);
  const [connectionState, setConnectionState] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) pcRef.current.close();

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      console.log('[WebRTC] Connection state:', pc.connectionState);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socket.current) {
        socket.current.emit('ice-candidate', { roomId, candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received');
      if (onRemoteStream && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    return pc;
  }, [roomId, socket, onRemoteStream]);

  const setupDataChannel = (channel) => {
    dataChannelRef.current = channel;
    channel.onopen = () => console.log('[WebRTC] Data channel open');
    channel.onclose = () => console.log('[WebRTC] Data channel closed');
    channel.onmessage = (event) => {
      if (onDataMessage) {
        try {
          onDataMessage(JSON.parse(event.data));
        } catch (e) {}
      }
    };
  };

  // HOST: Start screen sharing and create offer
  const startScreenShare = useCallback(async () => {
    try {
      setConnectionState('connecting');

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });

      localStreamRef.current = stream;
      const pc = createPeerConnection();

      // Data channel for remote control
      const dc = pc.createDataChannel('control', { ordered: true });
      setupDataChannel(dc);

      // Add tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle stream end (user stops sharing)
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket.current) {
        socket.current.emit('webrtc-offer', { roomId, offer });
      }

      return stream;
    } catch (err) {
      setConnectionState('failed');
      throw err;
    }
  }, [createPeerConnection, roomId, socket]);

  // VIEWER: Handle incoming offer and create answer
  const handleOffer = useCallback(async (offer) => {
    const pc = createPeerConnection();

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (socket.current) {
      socket.current.emit('webrtc-answer', { roomId, answer });
    }
    setConnectionState('connecting');
  }, [createPeerConnection, roomId, socket]);

  // HOST: Handle answer from viewer
  const handleAnswer = useCallback(async (answer) => {
    if (pcRef.current) {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  // Both: Handle ICE candidates
  const handleIceCandidate = useCallback(async (candidate) => {
    if (pcRef.current && candidate) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] ICE candidate error:', e.message);
      }
    }
  }, []);

  // Send remote control event via data channel
  const sendControlEvent = useCallback((eventData) => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(eventData));
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setConnectionState('idle');
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  return {
    connectionState,
    isMuted,
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
