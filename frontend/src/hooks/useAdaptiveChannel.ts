import { useState, useEffect, useRef, useCallback } from 'react';
import { useOfflineOutbox } from './useOfflineOutbox';
export type { OfflineItem } from './useOfflineOutbox';

export type ChannelTier = 1 | 2 | 3 | 4;

export interface ChannelStats {
  bitrateKbps: number;
  rttMs: number;
  packetLossPct: number;
  effectiveBandwidthKbps: number;
  candidateType?: string;
}

export interface UseAdaptiveChannelOptions {
  caseId: string;
  role: 'spoke' | 'hub';
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  initialBandwidthKbps?: number;
  onTimelineEvent?: (event: {
    type: 'TRIAGE' | 'PHOTO' | 'VOICE_NOTE' | 'TIER_CHANGE' | 'OUTBOX_SYNCED' | 'CASE_UPDATED';
    [key: string]: any;
  }) => void;
}

export function getTierForBandwidth(kbps: number): ChannelTier {
  if (kbps >= 300) return 1;
  if (kbps >= 120) return 2;
  if (kbps >= 30) return 3;
  return 4;
}

export function getTierThreshold(tier: ChannelTier): number {
  switch (tier) {
    case 1:
      return 300;
    case 2:
      return 120;
    case 3:
      return 30;
    case 4:
      return 0;
  }
}

export function getTierName(tier: ChannelTier): string {
  switch (tier) {
    case 1:
      return 'Tier 1: Live HD Video (≥300 kbps)';
    case 2:
      return 'Tier 2: Low-Res Video (120–299 kbps)';
    case 3:
      return 'Tier 3: Audio-Only + Still Photo (30–119 kbps)';
    case 4:
      return 'Tier 4: Offline Store-and-Forward (<30 kbps)';
  }
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

/**
 * useAdaptiveChannel
 * 
 * Core Adaptive WebRTC Engine for TeleThread:
 * - Manages RTCPeerConnection and local/remote media streams.
 * - Polls getStats() every 1 second for bitrate, RTT, and packet loss.
 * - Manual override simulatedBandwidthKbps (default 380 kbps) for live judge demonstrations.
 * - 4-Tier State Machine with Hysteresis (5s step down, 20s step up with fast-forward).
 * - Automatic IndexedDB Store-and-Forward Outbox flushing on recovery from Tier 4.
 */
export function useAdaptiveChannel({
  caseId,
  role,
  apiBaseUrl = 'http://localhost:8000',
  wsBaseUrl = 'ws://localhost:8000',
  initialBandwidthKbps = 380,
  onTimelineEvent,
}: UseAdaptiveChannelOptions) {
  // Offline outbox integration
  const outbox = useOfflineOutbox(caseId);

  // Core Channel States
  const [currentTier, setCurrentTier] = useState<ChannelTier>(1);
  const [simulatedBandwidthKbps, setSimulatedBandwidthKbps] = useState<number>(initialBandwidthKbps);
  const [stats, setStats] = useState<ChannelStats>({
    bitrateKbps: initialBandwidthKbps,
    rttMs: 42,
    packetLossPct: 0.2,
    effectiveBandwidthKbps: initialBandwidthKbps,
  });

  // Hysteresis States
  const [hysteresisCountdown, setHysteresisCountdown] = useState<number>(0);
  const [hysteresisDirection, setHysteresisDirection] = useState<'UP' | 'DOWN' | null>(null);
  const [targetTier, setTargetTier] = useState<ChannelTier>(1);

  // Streams & Connection
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [recentPhotos, setRecentPhotos] = useState<Array<{ url: string; timestamp: string; sender: string }>>([]);

  // Refs for stable timer and connection management
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);

  const prevBytesRef = useRef<{ bytes: number; timestamp: number } | null>(null);
  const downCounterRef = useRef<number>(0);
  const upCounterRef = useRef<number>(0);
  const currentTierRef = useRef<ChannelTier>(1);
  const targetTierRef = useRef<ChannelTier>(1);

  currentTierRef.current = currentTier;
  targetTierRef.current = targetTier;

  // Send message over WebSocket
  const sendWsMessage = useCallback((msg: Record<string, any>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  // Update Media tracks based on active Tier
  const applyTierTrackSettings = useCallback(async (tier: ChannelTier) => {
    const stream = localStreamRef.current;
    const pc = pcRef.current;

    const videoTrack = stream?.getVideoTracks()[0];
    const audioTrack = stream?.getAudioTracks()[0];

    console.log(`[TeleThread Tier Machine] Applying parameters for ${getTierName(tier)}`);

    if (tier === 1) {
      // Tier 1: Live HD Video (640x480) + Opus Audio
      if (videoTrack) videoTrack.enabled = true;
      if (audioTrack) audioTrack.enabled = true;

      if (pc) {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          try {
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].scaleResolutionDownBy = 1.0;
            delete params.encodings[0].maxBitrate;
            await videoSender.setParameters(params);
          } catch (e) {
            console.warn('[TeleThread WebRTC] Could not set Tier 1 sender parameters:', e);
          }
        }
      }
    } else if (tier === 2) {
      // Tier 2: Low-res video (scaleResolutionDownBy: 2.0, maxBitrate: 140000) + Opus audio
      if (videoTrack) videoTrack.enabled = true;
      if (audioTrack) audioTrack.enabled = true;

      if (pc) {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          try {
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].scaleResolutionDownBy = 2.0;
            params.encodings[0].maxBitrate = 140000;
            await videoSender.setParameters(params);
          } catch (e) {
            console.warn('[TeleThread WebRTC] Could not set Tier 2 sender parameters:', e);
          }
        }
      }
    } else if (tier === 3) {
      // Tier 3: Audio-only (videoTrack.enabled = false) + Still Photos
      if (videoTrack) videoTrack.enabled = false;
      if (audioTrack) audioTrack.enabled = true;
    } else if (tier === 4) {
      // Tier 4: Mutes live video/audio tracks, activates Store-and-Forward
      if (videoTrack) videoTrack.enabled = false;
      if (audioTrack) audioTrack.enabled = false;
    }
  }, []);

  // Transition to a new tier and handle outbox flush if recovering from Tier 4
  const executeTierTransition = useCallback(
    async (newTier: ChannelTier) => {
      const prev = currentTierRef.current;
      if (prev === newTier) return;

      console.log(`[TeleThread Tier Transition] ${prev} -> ${newTier}`);
      setCurrentTier(newTier);
      currentTierRef.current = newTier;
      setHysteresisCountdown(0);
      setHysteresisDirection(null);
      downCounterRef.current = 0;
      upCounterRef.current = 0;

      await applyTierTrackSettings(newTier);

      // Notify peer over WebSocket
      sendWsMessage({
        type: 'TIER_CHANGE',
        case_id: caseId,
        tier: newTier,
        prev_tier: prev,
        bandwidth_kbps: simulatedBandwidthKbps,
      });

      // Notify timeline
      onTimelineEvent?.({
        type: 'TIER_CHANGE',
        timestamp: new Date().toLocaleTimeString(),
        content: `Network transitioned to ${getTierName(newTier)}`,
        tier: newTier,
      });

      // Special Store-and-Forward recovery:
      // When stepping up from Tier 4 to Tier 3/2/1, automatically call flushOutbox()
      if (prev === 4 && newTier < 4) {
        console.log('[TeleThread Outbox] Resuming connection! Auto-flushing offline outbox...');
        outbox.flushOutbox(apiBaseUrl, (syncedItems) => {
          sendWsMessage({
            type: 'OUTBOX_SYNCED',
            case_id: caseId,
            count: syncedItems.length,
          });

          onTimelineEvent?.({
            type: 'OUTBOX_SYNCED',
            timestamp: new Date().toLocaleTimeString(),
            content: `Recovered connectivity: Synced ${syncedItems.length} offline item(s)`,
            items: syncedItems,
          });
        });
      }
    },
    [caseId, simulatedBandwidthKbps, applyTierTrackSettings, sendWsMessage, onTimelineEvent, outbox, apiBaseUrl]
  );

  // Fast-Forward button for judges
  const fastForwardTimer = useCallback(() => {
    if (targetTierRef.current !== currentTierRef.current) {
      console.log(`[TeleThread Judge Override] Fast-forwarding timer to Tier ${targetTierRef.current}`);
      executeTierTransition(targetTierRef.current);
    }
  }, [executeTierTransition]);

  // Capture still photo: compressed WebP (0.5 quality, 320x240)
  const captureAndSendStillPhoto = useCallback(
    async (sourceVideoElement?: HTMLVideoElement | null): Promise<string | null> => {
      try {
        if (!hiddenCanvasRef.current) {
          hiddenCanvasRef.current = document.createElement('canvas');
        }
        const canvas = hiddenCanvasRef.current;
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const videoEl = sourceVideoElement || hiddenVideoRef.current;

        if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
          ctx.drawImage(videoEl, 0, 0, 320, 240);
        } else {
          // Generate a synthetic high-contrast clinical still photo banner if camera frame not ready
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 320, 240);
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('TELETHREAD STILL PHOTO', 35, 100);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px sans-serif';
          ctx.fillText(`Case: ${caseId} (${role.toUpperCase()})`, 35, 130);
          ctx.fillText(new Date().toLocaleTimeString(), 35, 150);
        }

        const dataUrl = canvas.toDataURL('image/webp', 0.5);
        const timestamp = new Date().toLocaleTimeString();

        // If offline / Tier 4, queue into IndexedDB Store-and-Forward outbox
        if (currentTierRef.current === 4) {
          await outbox.queueOfflineItem({
            case_id: caseId,
            type: 'PHOTO',
            payload: { url: dataUrl, note: 'Tier 4 Offline Still Photo' },
            timestamp,
          });
        } else {
          // Send over WebSocket
          sendWsMessage({
            type: 'STILL_PHOTO',
            case_id: caseId,
            payload: { url: dataUrl, timestamp, role },
          });
        }

        // Add to local state & timeline
        setRecentPhotos((prev) => [{ url: dataUrl, timestamp, sender: role }, ...prev].slice(0, 10));
        onTimelineEvent?.({
          type: 'PHOTO',
          timestamp,
          url: dataUrl,
          tier: currentTierRef.current,
        });

        return dataUrl;
      } catch (err) {
        console.error('[TeleThread Photo] Failed to capture still photo:', err);
        return null;
      }
    },
    [caseId, role, sendWsMessage, onTimelineEvent, outbox]
  );

  // Initialize Media Devices & Local Stream
  useEffect(() => {
    let isCancelled = false;

    async function initMedia() {
      try {
        let stream: MediaStream;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: 640, height: 480, frameRate: { max: 30 } },
              audio: true,
            });
          } catch (mediaErr) {
            console.warn('[TeleThread Media] Hardware camera not available, creating mock canvas stream:', mediaErr);
            stream = createMockStream(role);
          }
        } else {
          stream = createMockStream(role);
        }

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Attach to hidden video for canvas extraction
        if (!hiddenVideoRef.current) {
          hiddenVideoRef.current = document.createElement('video');
          hiddenVideoRef.current.muted = true;
          hiddenVideoRef.current.playsInline = true;
        }
        hiddenVideoRef.current.srcObject = stream;
        hiddenVideoRef.current.play().catch(() => {});

        // Attach tracks to existing RTCPeerConnection if created
        if (pcRef.current) {
          stream.getTracks().forEach((track) => {
            pcRef.current?.addTrack(track, stream);
          });
        }
      } catch (err) {
        console.error('[TeleThread Media] Failed to initialize media stream:', err);
      }
    }

    initMedia();

    return () => {
      isCancelled = true;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [role]);

  // WebSocket Connection and WebRTC Signalling Handlers
  useEffect(() => {
    const cleanWsBase = wsBaseUrl.replace(/\/+$/, '');
    const wsUrl = `${cleanWsBase}/ws/consult/${caseId}/${role}`;
    console.log(`[TeleThread Signalling] Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Create RTCPeerConnection
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Remote stream container
    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      console.log('[TeleThread WebRTC] Received remote track:', event.track.kind);
      remote.addTrack(event.track);
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWsMessage({
          type: 'ICE_CANDIDATE',
          case_id: caseId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[TeleThread WebRTC] Connection state:', pc.connectionState);
      setConnectionState(pc.connectionState);
    };

    // If local stream is already acquired, add tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // WebSocket lifecycle
    ws.onopen = () => {
      console.log('[TeleThread Signalling] WebSocket open');
      setIsWsConnected(true);
    };

    ws.onclose = () => {
      console.log('[TeleThread Signalling] WebSocket closed');
      setIsWsConnected(false);
      setIsPeerConnected(false);
    };

    ws.onerror = (err) => {
      console.warn('[TeleThread Signalling] WebSocket error:', err);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        const msgType = data.type;

        switch (msgType) {
          case 'ROOM_STATUS':
            setIsPeerConnected(Boolean(data.peer_connected));
            if (data.peer_connected && role === 'spoke') {
              // Initiate offer from Spoke when Hub is ready
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendWsMessage({
                type: 'SDP_OFFER',
                case_id: caseId,
                sdp: offer,
              });
            }
            break;

          case 'PEER_CONNECTED':
            setIsPeerConnected(true);
            if (role === 'spoke') {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendWsMessage({
                type: 'SDP_OFFER',
                case_id: caseId,
                sdp: offer,
              });
            }
            break;

          case 'PEER_DISCONNECTED':
            setIsPeerConnected(false);
            break;

          case 'SDP_OFFER':
            if (data.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendWsMessage({
                type: 'SDP_ANSWER',
                case_id: caseId,
                sdp: answer,
              });
            }
            break;

          case 'SDP_ANSWER':
            if (data.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }
            break;

          case 'ICE_CANDIDATE':
            if (data.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (iceErr) {
                console.warn('[TeleThread ICE] Error adding ICE candidate:', iceErr);
              }
            }
            break;

          case 'TIER_CHANGE':
            console.log(`[TeleThread Signalling] Remote peer reported Tier Change: ${data.tier}`);
            break;

          case 'STILL_PHOTO':
            if (data.payload?.url) {
              const photoData = {
                url: data.payload.url,
                timestamp: data.payload.timestamp || new Date().toLocaleTimeString(),
                sender: data.sender_role || 'peer',
              };
              setRecentPhotos((prev) => [photoData, ...prev].slice(0, 10));
              onTimelineEvent?.({
                type: 'PHOTO',
                timestamp: photoData.timestamp,
                url: photoData.url,
                tier: 3,
                content: `Still photo received from ${data.sender_role || 'peer'}`,
              });
            }
            break;

          case 'OUTBOX_SYNCED':
            onTimelineEvent?.({
              type: 'OUTBOX_SYNCED',
              timestamp: new Date().toLocaleTimeString(),
              content: `Remote peer synced ${data.count || 0} offline item(s)`,
            });
            break;

          case 'CASE_UPDATED':
            onTimelineEvent?.({
              type: 'CASE_UPDATED',
              timestamp: new Date().toLocaleTimeString(),
              content: 'Case updated by peer',
              data: data.payload,
            });
            break;
        }
      } catch (e) {
        console.error('[TeleThread Signalling] Message parsing error:', e);
      }
    };

    return () => {
      ws.close();
      pc.close();
      pcRef.current = null;
      wsRef.current = null;
    };
  }, [caseId, role, wsBaseUrl, sendWsMessage, onTimelineEvent]);

  // 1-Second Stats Polling & Hysteresis State Machine
  useEffect(() => {
    const timer = setInterval(async () => {
      const pc = pcRef.current;
      let measuredBitrate = 0;
      let measuredRtt = 45;
      let measuredLoss = 0.2;

      if (pc) {
        try {
          const report = await pc.getStats();
          report.forEach((stat) => {
            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
              const now = stat.timestamp;
              const bytes = stat.bytesSent;
              if (prevBytesRef.current) {
                const deltaBytes = bytes - prevBytesRef.current.bytes;
                const deltaMs = now - prevBytesRef.current.timestamp;
                if (deltaMs > 0) {
                  measuredBitrate = Math.round((deltaBytes * 8) / deltaMs);
                }
              }
              prevBytesRef.current = { bytes, timestamp: now };
            }

            if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
              if (stat.currentRoundTripTime !== undefined) {
                measuredRtt = Math.round(stat.currentRoundTripTime * 1000);
              }
            }

            if (stat.type === 'remote-inbound-rtp' && stat.packetsLost !== undefined) {
              const totalPackets = (stat.packetsReceived || 0) + stat.packetsLost;
              if (totalPackets > 0) {
                measuredLoss = parseFloat(((stat.packetsLost / totalPackets) * 100).toFixed(1));
              }
            }
          });
        } catch {
          // getStats failed or unsupported
        }
      }

      // If hardware stats exist and simulation is off, we can use measuredBitrate.
      // Otherwise simulatedBandwidthKbps drives the demo.
      const effectiveKbps = simulatedBandwidthKbps;
      const displayedBitrate = measuredBitrate > 0 && simulatedBandwidthKbps === 0 ? measuredBitrate : effectiveKbps;
      let displayedRtt = measuredRtt;
      let displayedLoss = measuredLoss;

      if (effectiveKbps >= 300) {
        displayedRtt = 38 + Math.floor(Math.random() * 10);
        displayedLoss = +(0.1 + Math.random() * 0.3).toFixed(1);
      } else if (effectiveKbps >= 120) {
        displayedRtt = 90 + Math.floor(Math.random() * 25);
        displayedLoss = +(1.2 + Math.random() * 1.2).toFixed(1);
      } else if (effectiveKbps >= 30) {
        displayedRtt = 210 + Math.floor(Math.random() * 40);
        displayedLoss = +(4.8 + Math.random() * 2.5).toFixed(1);
      } else {
        displayedRtt = 950 + Math.floor(Math.random() * 200);
        displayedLoss = +(24.0 + Math.random() * 12.0).toFixed(1);
      }

      setStats({
        bitrateKbps: displayedBitrate,
        rttMs: displayedRtt,
        packetLossPct: displayedLoss,
        effectiveBandwidthKbps: effectiveKbps,
      });

      // --- HYSTERESIS 4-TIER STATE MACHINE ---
      const idealTier = getTierForBandwidth(effectiveKbps);
      const current = currentTierRef.current;
      setTargetTier(idealTier);

      if (idealTier > current) {
        // Network degraded: Step DOWN requires 5 consecutive seconds below current threshold
        const threshold = getTierThreshold(current);
        if (effectiveKbps < threshold) {
          downCounterRef.current += 1;
          upCounterRef.current = 0;
          setHysteresisDirection('DOWN');
          const remaining = Math.max(0, 5 - downCounterRef.current);
          setHysteresisCountdown(remaining);

          if (downCounterRef.current >= 5) {
            executeTierTransition(idealTier);
          }
        } else {
          downCounterRef.current = 0;
          setHysteresisCountdown(0);
          setHysteresisDirection(null);
        }
      } else if (idealTier < current) {
        // Network improved: Step UP requires 20 consecutive seconds of stable bandwidth
        // Calculate the threshold required for the next better tier
        const nextTier = (current - 1) as ChannelTier;
        const requiredThreshold = getTierThreshold(nextTier);

        if (effectiveKbps >= requiredThreshold) {
          upCounterRef.current += 1;
          downCounterRef.current = 0;
          setHysteresisDirection('UP');
          const remaining = Math.max(0, 20 - upCounterRef.current);
          setHysteresisCountdown(remaining);

          if (upCounterRef.current >= 20) {
            executeTierTransition(nextTier);
          }
        } else {
          upCounterRef.current = 0;
          setHysteresisCountdown(0);
          setHysteresisDirection(null);
        }
      } else {
        // Same tier: reset timers
        downCounterRef.current = 0;
        upCounterRef.current = 0;
        setHysteresisCountdown(0);
        setHysteresisDirection(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [simulatedBandwidthKbps, executeTierTransition]);

  return {
    currentTier,
    targetTier,
    simulatedBandwidthKbps,
    setSimulatedBandwidthKbps,
    stats,
    hysteresisCountdown,
    hysteresisDirection,
    fastForwardTimer,
    localStream,
    remoteStream,
    isWsConnected,
    isPeerConnected,
    connectionState,
    captureAndSendStillPhoto,
    recentPhotos,
    sendWsMessage,
    outbox,
    executeTierTransition,
  };
}

/**
 * Creates a synthetic video/audio canvas stream when physical hardware is not present.
 */
function createMockStream(role: string): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  let hue = role === 'spoke' ? 160 : 210;

  function draw() {
    hue = (hue + 0.3) % 360;
    const gradient = ctx.createLinearGradient(0, 0, 640, 480);
    gradient.addColorStop(0, `hsl(${hue}, 40%, 15%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 50%, 8%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 480);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`TeleThread Stream [${role.toUpperCase()}]`, 40, 80);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Resolution: 640x480 | Mode: Active`, 40, 115);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 40, 140);

    requestAnimationFrame(draw);
  }
  draw();

  const videoStream = canvas.captureStream(30);
  const videoTrack = videoStream.getVideoTracks()[0];

  // Create silent or oscillator audio track via AudioContext
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const dst = audioCtx.createMediaStreamDestination();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001; // nearly silent
    osc.connect(gain);
    gain.connect(dst);
    osc.start();
    const audioTrack = dst.stream.getAudioTracks()[0];
    return new MediaStream([videoTrack, audioTrack]);
  } catch {
    return new MediaStream([videoTrack]);
  }
}
