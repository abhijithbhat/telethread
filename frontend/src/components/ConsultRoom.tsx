import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Inbox,
  User,
  Activity,
  Layers,
} from 'lucide-react';
import { NetworkSimulatorHUD } from './NetworkSimulatorHUD';
import { useAdaptiveChannel } from '../hooks/useAdaptiveChannel';

export interface CaseTimelineItem {
  timestamp: string;
  type: 'TRIAGE' | 'PHOTO' | 'VOICE_NOTE' | 'TIER_CHANGE' | 'OUTBOX_SYNCED' | 'CASE_UPDATED' | string;
  content?: string;
  url?: string;
  transcript?: string;
  tier?: number;
  [key: string]: any;
}

export interface CaseVitals {
  bp_systolic: number;
  bp_diastolic: number;
  spo2: number;
  temp_f: number;
  hr: number;
}

export interface CaseData {
  id: string;
  patient_name: string;
  age: number;
  gender: string;
  abha_id?: string;
  consent_given?: boolean;
  village_taluka: string;
  symptoms: string[];
  vitals: CaseVitals;
  is_red_flag: boolean;
  emergency_action?: string;
  specialty?: string;
  urgency?: string;
  current_tier?: number;
  ai_clinical_brief?: string;
  timeline: CaseTimelineItem[];
  prescription?: any;
}

export interface ConsultRoomProps {
  caseData: CaseData;
  role: 'spoke' | 'hub';
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  onCaseUpdate?: (updatedCase: CaseData) => void;
  onLeave?: () => void;
}

export const ConsultRoom: React.FC<ConsultRoomProps> = ({
  caseData,
  role,
  apiBaseUrl = 'http://localhost:8000',
  wsBaseUrl = 'ws://localhost:8000',
  onCaseUpdate,
  onLeave,
}) => {
  // Local timeline state for real-time reactivity without page reload
  const [timeline, setTimeline] = useState<CaseTimelineItem[]>(caseData.timeline || []);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);

  // Audio/Video mute controls
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  // Voice note recorder state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState(15);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<any>(null);

  // Video element refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Event handler for timeline events received via WebSocket or channel transitions
  const handleTimelineEvent = useCallback(
    (event: any) => {
      setTimeline((prev) => {
        // Avoid duplicate consecutive identical events
        const last = prev[0];
        if (last && last.type === event.type && last.content === event.content && last.timestamp === event.timestamp) {
          return prev;
        }
        const updated = [event, ...prev];
        onCaseUpdate?.({ ...caseData, timeline: updated });
        return updated;
      });
    },
    [caseData, onCaseUpdate]
  );

  // Adaptive WebRTC & Tier 1–4 Channel Hook
  const {
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
    captureAndSendStillPhoto,
    recentPhotos,
    outbox,
  } = useAdaptiveChannel({
    caseId: caseData.id,
    role,
    apiBaseUrl,
    wsBaseUrl,
    onTimelineEvent: handleTimelineEvent,
  });

  // Attach local and remote streams to video tags
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Handle local mic mute toggle
  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMicMuted;
        setIsMicMuted(!isMicMuted);
      }
    }
  };

  // Handle local camera toggle
  const toggleCam = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isCamOff;
        setIsCamOff(!isCamOff);
      }
    }
  };

  // Trigger Snap Still Photo
  const handleSnapPhoto = async () => {
    const dataUrl = await captureAndSendStillPhoto(localVideoRef.current);
    if (dataUrl) {
      console.log('[TeleThread UI] Captured still photo successfully');
    }
  };

  // Voice Note Recorder (15s voice note)
  const startVoiceRecording = async () => {
    try {
      let stream = localStream;
      if (!stream || stream.getAudioTracks().length === 0) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          const timestamp = new Date().toLocaleTimeString();
          const transcript = role === 'spoke'
            ? 'Spoke Audio Note: Patient complaining of severe crushing chest pain, diaphoresis.'
            : 'Hub Doctor Note: Administer Disprin 325mg immediately, prepare for urgent ambulance dispatch.';

          if (currentTier === 4) {
            // Queue to IndexedDB Store-and-Forward outbox
            await outbox.queueOfflineItem({
              case_id: caseData.id,
              type: 'VOICE_NOTE',
              payload: { audioUrl: base64Audio, transcript, duration: 15 },
              timestamp,
            });
          }

          // Add to local timeline
          handleTimelineEvent({
            timestamp,
            type: 'VOICE_NOTE',
            transcript,
            audioUrl: base64Audio,
            tier: currentTier,
            content: `Voice note recorded (${role.toUpperCase()})`,
          });
        };
      };

      recorder.start();
      setIsRecordingVoice(true);
      setVoiceSecondsLeft(15);

      voiceTimerRef.current = setInterval(() => {
        setVoiceSecondsLeft((prev) => {
          if (prev <= 1) {
            stopVoiceRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('[TeleThread Voice] Could not start voice recorder:', err);
    }
  };

  const stopVoiceRecording = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
  };

  // Offline Vitals Quick Queue (Tier 4 demonstration)
  const handleQueueOfflineVitals = async () => {
    const timestamp = new Date().toLocaleTimeString();
    await outbox.queueOfflineItem({
      case_id: caseData.id,
      type: 'VITALS',
      payload: { ...caseData.vitals, recorded_at: timestamp },
      timestamp,
    });
    handleTimelineEvent({
      timestamp,
      type: 'VITALS',
      content: `Offline vitals queued into IndexedDB: BP ${caseData.vitals.bp_systolic}/${caseData.vitals.bp_diastolic}, SpO2 ${caseData.vitals.spo2}%`,
      tier: 4,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#070a13',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* 1. Header Bar: Clinical Case Identification */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          backgroundColor: '#0b1120',
          borderBottom: '1px solid #1e293b',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: '#fff',
                fontSize: '16px',
                boxShadow: '0 0 12px rgba(37, 99, 235, 0.5)',
              }}
            >
              TT
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>TeleThread</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  Case {caseData.id}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Sub-District Teleconsultation Engine
              </div>
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#334155' }} />

          {/* Patient Overview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={15} color="#38bdf8" />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                {caseData.patient_name}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                ({caseData.age}/{caseData.gender})
              </span>
            </div>

            <span
              style={{
                fontSize: '11px',
                color: '#cbd5e1',
                backgroundColor: '#1e293b',
                padding: '3px 8px',
                borderRadius: '4px',
              }}
            >
              {caseData.village_taluka}
            </span>

            {caseData.is_red_flag && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#7f1d1d',
                  color: '#fca5a5',
                  border: '1px solid #dc2626',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  animation: 'pulse 1.5s infinite',
                }}
              >
                <AlertTriangle size={12} />
                CRITICAL EMERGENCY
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              fontSize: '12px',
              color: '#94a3b8',
              backgroundColor: '#1e293b',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            Specialty: <strong style={{ color: '#e2e8f0' }}>{caseData.specialty || 'General'}</strong>
          </div>

          {onLeave && (
            <button
              onClick={onLeave}
              type="button"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Exit Consultation
            </button>
          )}
        </div>
      </header>

      {/* 2. Embedded Sticky Top Network Simulator & Telemetry HUD */}
      <NetworkSimulatorHUD
        currentTier={currentTier}
        targetTier={targetTier}
        bitrateKbps={stats.bitrateKbps}
        rttMs={stats.rttMs}
        packetLossPct={stats.packetLossPct}
        simulatedBandwidthKbps={simulatedBandwidthKbps}
        setSimulatedBandwidthKbps={setSimulatedBandwidthKbps}
        hysteresisCountdown={hysteresisCountdown}
        hysteresisDirection={hysteresisDirection}
        onFastForward={fastForwardTimer}
        role={role}
        isWsConnected={isWsConnected}
        isPeerConnected={isPeerConnected}
        pendingOutboxCount={outbox.pendingItems.length}
      />

      {/* 3. Main Split Stage: Left Consultation Media / Stage & Right Clinical Timeline */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 380px',
          flex: '1 1 auto',
          overflow: 'hidden',
        }}
      >
        {/* Left Panel: Dynamic Adaptive Media Stage */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* Emergency Alert Banner if red flag */}
          {caseData.is_red_flag && caseData.emergency_action && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#450a0a',
                border: '1px solid #b91c1c',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#fecaca',
                fontSize: '13px',
              }}
            >
              <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
              <div>
                <strong>Clinical Red Flag:</strong> {caseData.emergency_action}
              </div>
            </div>
          )}

          {/* Tier Dynamic Stage */}
          <div
            style={{
              backgroundColor: '#0c111e',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '16px',
              flex: '1 1 auto',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '440px',
            }}
          >
            {/* TIER 1 & TIER 2: Live Video Stream Display */}
            {(currentTier === 1 || currentTier === 2) && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: currentTier === 1 ? '#10b981' : '#0ea5e9',
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                      {currentTier === 1 ? 'Live Full-HD Consultation Stream' : 'Low-Bandwidth Video (50% Downscaled, 140 kbps Cap)'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {isPeerConnected ? 'WebRTC P2P Active' : 'Signalling Peer...'}
                  </span>
                </div>

                {/* Side-by-Side Video Elements */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr',
                    gap: '12px',
                    flex: '1 1 auto',
                    minHeight: '340px',
                  }}
                >
                  {/* Remote Video (Doctor or Patient) */}
                  <div
                    style={{
                      position: 'relative',
                      backgroundColor: '#030712',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: '1px solid #1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: isPeerConnected && remoteStream ? 'block' : 'none',
                      }}
                    />

                    {/* Realistic Doctor Telepresence Feed for Solo Demonstrations */}
                    {(!isPeerConnected || !remoteStream) && (
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: '100%',
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={
                            role === 'spoke'
                              ? 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=800&q=80'
                              : 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80'
                          }
                          alt="Remote Peer Telepresence"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: currentTier === 2 ? 'blur(1.5px) contrast(0.95)' : 'none',
                            transition: 'filter 0.3s ease',
                          }}
                        />

                        {/* Top-Right Telepresence Watermark */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            backgroundColor: 'rgba(6, 78, 59, 0.85)',
                            backdropFilter: 'blur(6px)',
                            border: '1px solid #059669',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#6ee7b7',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: '#10b981',
                              boxShadow: '0 0 6px #10b981',
                            }}
                          />
                          {role === 'spoke' ? 'LIVE • District Hospital Hub' : 'LIVE • Sullia PHC Sub-Centre'}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        backgroundColor: 'rgba(0,0,0,0.75)',
                        backdropFilter: 'blur(4px)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                        }}
                      />
                      {role === 'spoke'
                        ? 'Dr. K. Srinivas, MD (District Specialist Hub)'
                        : 'Patient Ramesh Gowda (Sullia PHC)'}
                    </div>
                  </div>

                  {/* Local Video (Self) */}
                  <div
                    style={{
                      position: 'relative',
                      backgroundColor: '#030712',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: '1px solid #1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        backdropFilter: 'blur(4px)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#f8fafc',
                      }}
                    >
                      You ({role === 'spoke' ? 'PHC MO' : 'Specialist'})
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TIER 3: Audio-Only Waveform + Still Photo Gallery */}
            {currentTier === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px' }}>
                <div
                  style={{
                    backgroundColor: '#78350f',
                    border: '1px solid #d97706',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#fef3c7',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Volume2 size={16} />
                    <span>
                      <strong>Tier 3 Mode Active (30–119 kbps):</strong> Video paused to preserve continuous clinical Opus voice audio.
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#fde68a' }}>Opus Audio: 24 kbps</span>
                </div>

                {/* Animated Audio Waveform Simulator */}
                <div
                  style={{
                    backgroundColor: '#080d1a',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    minHeight: '140px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}>
                    {[16, 28, 42, 20, 36, 48, 22, 14, 38, 44, 25, 33, 18, 40].map((h, i) => (
                      <span
                        key={i}
                        style={{
                          width: '4px',
                          height: `${h}px`,
                          backgroundColor: '#f59e0b',
                          borderRadius: '2px',
                          animation: `pulse ${0.6 + (i % 5) * 0.2}s infinite alternate ease-in-out`,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 600 }}>
                    Live Audio Channel Connected (Doctor & Patient Speaking)
                  </span>
                </div>

                {/* Still Photos Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                      Clinical Still Photo Stream (WebP 0.5q, 320x240)
                    </span>
                    <button
                      type="button"
                      onClick={handleSnapPhoto}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#d97706',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      <Camera size={14} /> Snap Still Photo
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      overflowX: 'auto',
                      padding: '8px 0',
                    }}
                  >
                    {recentPhotos.length === 0 ? (
                      <div
                        style={{
                          padding: '24px',
                          color: '#64748b',
                          fontSize: '12px',
                          textAlign: 'center',
                          width: '100%',
                          border: '1px dashed #334155',
                          borderRadius: '8px',
                        }}
                      >
                        No still photos captured yet. Click "Snap Still Photo" to capture and transmit a lightweight image.
                      </div>
                    ) : (
                      recentPhotos.map((photo, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedPhotoModal(photo.url)}
                          style={{
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px solid #334155',
                            flexShrink: 0,
                            width: '140px',
                          }}
                        >
                          <img
                            src={photo.url}
                            alt="Clinical Still"
                            style={{ width: '100%', height: '95px', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              fontSize: '10px',
                              padding: '2px 4px',
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{photo.sender}</span>
                            <span>{photo.timestamp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TIER 4: Offline Store-and-Forward Recorder & Outbox Manager */}
            {currentTier === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px' }}>
                <div
                  style={{
                    backgroundColor: '#7f1d1d',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5' }}>
                    <AlertTriangle size={18} color="#ef4444" />
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>
                      Tier 4: Ghat Outage / Complete Disconnection (&lt;30 kbps)
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#fecaca', lineHeight: 1.4 }}>
                    Live streams suspended. Store-and-Forward mode is active. All voice notes, photos, and vitals are securely cached in local IndexedDB. When bandwidth recovers (≥30 kbps), outbox flushes automatically on Case ID <strong>{caseData.id}</strong> with zero restarts.
                  </p>
                </div>

                {/* Offline Capture Toolset */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    flex: '1 1 auto',
                  }}
                >
                  {/* Offline Voice Note Card */}
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Mic size={16} color="#38bdf8" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                          Record 15s Clinical Voice Note
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                        Record clinical observations. Queues immediately to IndexedDB offline outbox.
                      </p>
                    </div>

                    {isRecordingVoice ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: '#ef4444',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          <span>Recording... ({voiceSecondsLeft}s left)</span>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#ef4444',
                              animation: 'pulse 1s infinite',
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          Finish & Save to Outbox
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px 14px',
                          borderRadius: '6px',
                          backgroundColor: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <Mic size={14} /> Start 15s Recording
                      </button>
                    )}
                  </div>

                  {/* Offline Still Photo & Vitals Card */}
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Camera size={16} color="#38bdf8" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                          Offline Clinical Photo & Vitals
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                        Snaps compressed WebP image or queues patient vitals directly into IndexedDB.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleSnapPhoto}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#334155',
                          color: '#f8fafc',
                          border: '1px solid #475569',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <Camera size={14} /> Snap Photo
                      </button>

                      <button
                        type="button"
                        onClick={handleQueueOfflineVitals}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#334155',
                          color: '#f8fafc',
                          border: '1px solid #475569',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <Activity size={14} /> Queue Vitals
                      </button>
                    </div>
                  </div>
                </div>

                {/* Outbox Pending Items List */}
                <div
                  style={{
                    backgroundColor: '#080d1a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8' }}>
                      <Inbox size={14} color="#38bdf8" />
                      <span>
                        IndexedDB Pending Outbox: <strong>{outbox.pendingItems.length} item(s)</strong>
                      </span>
                    </div>
                    {outbox.pendingItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => outbox.flushOutbox(apiBaseUrl)}
                        disabled={outbox.isSyncing}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#1e293b',
                          color: '#38bdf8',
                          border: '1px solid #0284c7',
                          cursor: 'pointer',
                        }}
                      >
                        {outbox.isSyncing ? 'Syncing...' : 'Attempt Sync Now'}
                      </button>
                    )}
                  </div>

                  {outbox.pendingItems.length === 0 ? (
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Outbox empty. Snap a photo or record a voice note to queue.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0' }}>
                      {outbox.pendingItems.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#0f172a',
                            borderRadius: '4px',
                            border: '1px solid #334155',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>{item.type}</span>
                          <span style={{ color: '#64748b' }}>({item.timestamp.slice(-8)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Media Controls Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '16px',
                marginTop: 'auto',
                borderTop: '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={toggleMic}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: isMicMuted ? '#7f1d1d' : '#1e293b',
                    color: isMicMuted ? '#fca5a5' : '#f8fafc',
                    border: '1px solid #334155',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {isMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
                  {isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
                </button>

                <button
                  type="button"
                  onClick={toggleCam}
                  disabled={currentTier >= 3}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: isCamOff || currentTier >= 3 ? '#334155' : '#1e293b',
                    color: currentTier >= 3 ? '#64748b' : '#f8fafc',
                    border: '1px solid #334155',
                    cursor: currentTier >= 3 ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {isCamOff || currentTier >= 3 ? <VideoOff size={15} /> : <Video size={15} />}
                  {currentTier >= 3 ? 'Video Disabled (Tier 3/4)' : isCamOff ? 'Turn Cam On' : 'Turn Cam Off'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleSnapPhoto}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Camera size={15} />
                  Snap Still Photo
                </button>

                <button
                  type="button"
                  onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: isRecordingVoice ? '#dc2626' : '#2563eb',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Mic size={15} />
                  {isRecordingVoice ? `Stop (${voiceSecondsLeft}s)` : 'Record 15s Voice Note'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Patient Vitals & Live Case Timeline */}
        <aside
          style={{
            backgroundColor: '#090d16',
            borderLeft: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Vitals Summary Card */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #1e293b',
              backgroundColor: '#0c101d',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Baseline Triage Vitals
              </span>
              <span style={{ fontSize: '11px', color: '#38bdf8' }}>{caseData.urgency || 'ROUTINE'}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}
            >
              <div style={{ backgroundColor: '#131b2e', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>BP</div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: caseData.vitals.bp_systolic > 140 ? '#f87171' : '#f8fafc',
                  }}
                >
                  {caseData.vitals.bp_systolic}/{caseData.vitals.bp_diastolic}
                </div>
              </div>

              <div style={{ backgroundColor: '#131b2e', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>SpO2</div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: caseData.vitals.spo2 < 92 ? '#f87171' : '#f8fafc',
                  }}
                >
                  {caseData.vitals.spo2}%
                </div>
              </div>

              <div style={{ backgroundColor: '#131b2e', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>HR</div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: caseData.vitals.hr > 100 ? '#f87171' : '#f8fafc',
                  }}
                >
                  {caseData.vitals.hr} bpm
                </div>
              </div>

              <div style={{ backgroundColor: '#131b2e', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Temp</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                  {caseData.vitals.temp_f}°F
                </div>
              </div>
            </div>

            {/* AI Brief */}
            {caseData.ai_clinical_brief && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#172554',
                  border: '1px solid #1e40af',
                  fontSize: '11px',
                  color: '#bfdbfe',
                  display: 'flex',
                  gap: '6px',
                }}
              >
                <Sparkles size={14} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{caseData.ai_clinical_brief}</span>
              </div>
            )}
          </div>

          {/* Timeline Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} color="#38bdf8" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>Live Case Timeline</span>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{timeline.length} events</span>
          </div>

          {/* Timeline Scroll List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {timeline.map((event, idx) => {
              const isPhoto = event.type === 'PHOTO';
              const isVoice = event.type === 'VOICE_NOTE';
              const isTier = event.type === 'TIER_CHANGE';
              const isSynced = event.type === 'OUTBOX_SYNCED';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isPhoto && <Camera size={13} color="#38bdf8" />}
                      {isVoice && <Mic size={13} color="#a855f7" />}
                      {isTier && <Layers size={13} color="#f59e0b" />}
                      {isSynced && <CheckCircle2 size={13} color="#10b981" />}
                      {!isPhoto && !isVoice && !isTier && !isSynced && <Activity size={13} color="#94a3b8" />}

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isPhoto
                            ? '#38bdf8'
                            : isVoice
                            ? '#c084fc'
                            : isTier
                            ? '#fbbf24'
                            : isSynced
                            ? '#34d399'
                            : '#cbd5e1',
                        }}
                      >
                        {event.type}
                      </span>
                    </div>

                    <span style={{ fontSize: '10px', color: '#64748b' }}>{event.timestamp}</span>
                  </div>

                  {event.content && (
                    <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '2px' }}>
                      {event.content}
                    </div>
                  )}

                  {/* Photo Thumbnail */}
                  {isPhoto && event.url && (
                    <div
                      style={{ marginTop: '6px', cursor: 'pointer' }}
                      onClick={() => setSelectedPhotoModal(event.url!)}
                    >
                      <img
                        src={event.url}
                        alt="Timeline Still"
                        style={{
                          width: '100%',
                          height: '110px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid #334155',
                        }}
                      />
                    </div>
                  )}

                  {/* Voice Note Audio Player / Transcript */}
                  {isVoice && (
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {event.audioUrl && (
                        <audio
                          src={event.audioUrl}
                          controls
                          style={{ width: '100%', height: '30px', marginTop: '4px' }}
                        />
                      )}
                      {event.transcript && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            backgroundColor: '#1e293b',
                            padding: '4px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          "{event.transcript}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* 4. Photo Lightbox Modal */}
      {selectedPhotoModal && (
        <div
          onClick={() => setSelectedPhotoModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '680px',
              width: '100%',
              backgroundColor: '#0f172a',
              borderRadius: '12px',
              border: '1px solid #334155',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Clinical Still Photo Inspection</span>
              <button
                type="button"
                onClick={() => setSelectedPhotoModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedPhotoModal}
                alt="Enlarged Clinical Still"
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  borderRadius: '6px',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
