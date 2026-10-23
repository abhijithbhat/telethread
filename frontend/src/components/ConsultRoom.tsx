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
  Bot,
  Loader2,
  Download,
  Smartphone,
  Plus,
  Trash2,
  FileCode,
  Stethoscope,
  Radio,
  ShieldCheck,
  Building2,
  Copy,
  Check,
} from 'lucide-react';
import { NetworkSimulatorHUD } from './NetworkSimulatorHUD';
import { useAdaptiveChannel } from '../hooks/useAdaptiveChannel';
import {
  speakText,
  startAudioRecording,
  stopAudioRecording,
  transcribeAudio,
  runBrowserSpeechRecognition,
  executeAutonomousAction,
  resolveApiBaseUrl,
  resolveWsBaseUrl,
  sanitizeApiUrl,
} from '../utils/voiceService';

export interface CaseTimelineItem {
  timestamp: string;
  type: 'TRIAGE' | 'PHOTO' | 'VOICE_NOTE' | 'TIER_CHANGE' | 'OUTBOX_SYNCED' | 'CASE_UPDATED' | 'PRESCRIPTION' | 'DOCTOR_INSTRUCTION' | 'AI_CO_CONSULTANT' | string;
  content?: string;
  url?: string;
  transcript?: string;
  tier?: number;
  role?: string;
  [key: string]: any;
}

export interface CaseVitals {
  bp_systolic: number;
  bp_diastolic: number;
  spo2: number;
  temp_f: number;
  hr: number;
}

export interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
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
  prescription?: {
    diagnosis?: string;
    medications?: MedicationItem[];
    advice?: string;
    follow_up?: string;
    doctor_name?: string;
    doctor_reg?: string;
  } | null;
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
  // Normalize backend URLs
  const effectiveApiBaseUrl = sanitizeApiUrl(
    apiBaseUrl && !apiBaseUrl.includes('localhost') && !apiBaseUrl.endsWith('telethread-api')
      ? apiBaseUrl
      : resolveApiBaseUrl()
  );
  const effectiveWsBaseUrl = (wsBaseUrl && !wsBaseUrl.includes('localhost'))
    ? wsBaseUrl
    : resolveWsBaseUrl(effectiveApiBaseUrl);

  // Role Perspective Switcher: 'spoke' | 'doctor' | 'split'
  const [perspective, setPerspective] = useState<'spoke' | 'doctor' | 'split'>('doctor');

  // Local timeline state
  const [timeline, setTimeline] = useState<CaseTimelineItem[]>(caseData.timeline || []);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);

  // Modals for 2G SMS & ABDM FHIR R4
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsCopied, setSmsCopied] = useState(false);
  const [showFhirModal, setShowFhirModal] = useState(false);
  const [fhirJson, setFhirJson] = useState<string>('');
  const [isLoadingFhir, setIsLoadingFhir] = useState(false);
  const [fhirCopied, setFhirCopied] = useState(false);

  // Media Controls
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  // Camera framing mode: 'contain' prevents cropping/zooming, 'cover' fills box
  const [cameraFit, setCameraFit] = useState<'contain' | 'cover'>('contain');

  // Spoke 15s Voice Note Recorder
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState(15);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<any>(null);

  // Spoke & Doctor Video Element Refs (Distinct refs to allow simultaneous split-screen playback)
  const spokeLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const spokeRemoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const doctorLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const doctorRemoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Prescription Form State (Pre-populated from caseData if existing)
  const [rxDiagnosis, setRxDiagnosis] = useState<string>(
    caseData.prescription?.diagnosis || 'Acute Coronary Syndrome (Suspected STEMI / Acute MI)'
  );
  const [rxMeds, setRxMeds] = useState<MedicationItem[]>(
    caseData.prescription?.medications && caseData.prescription.medications.length > 0
      ? caseData.prescription.medications
      : [
          { name: 'Tab. Aspirin', dosage: '325 mg', frequency: 'STAT (Chew)', duration: '1 day', instructions: 'Chew immediately with a sip of water' },
          { name: 'Tab. Clopidogrel', dosage: '300 mg', frequency: 'STAT', duration: '1 day', instructions: 'Take 4 tabs of 75mg immediately' },
          { name: 'Tab. Atorvastatin', dosage: '80 mg', frequency: 'STAT', duration: '1 day', instructions: 'Take at night' },
        ]
  );
  const [rxAdvice, setRxAdvice] = useState<string>(
    caseData.prescription?.advice ||
      'Strict bed rest. Continuous O2 at 4 L/min. Immediate ambulance dispatch to District Hospital Mangalore.'
  );
  const [rxFollowUp, setRxFollowUp] = useState<string>(
    caseData.prescription?.follow_up || 'Immediate transfer to District Hospital ICU'
  );
  const [doctorName, setDoctorName] = useState<string>(
    caseData.prescription?.doctor_name || 'Dr. K. Srinivas, MD (Cardiology)'
  );
  const [doctorReg, setDoctorReg] = useState<string>(
    caseData.prescription?.doctor_reg || 'KMC-78452'
  );
  const [isSigningRx, setIsSigningRx] = useState(false);
  const [signedRxData, setSignedRxData] = useState<{
    smsPreview?: string;
    pdfUrl?: string;
  } | null>(
    caseData.prescription
      ? {
          pdfUrl: `${effectiveApiBaseUrl}/api/cases/${caseData.id}/prescription.pdf`,
          smsPreview: undefined,
        }
      : null
  );

  // Live Doctor Voice Instruction & AI Co-Pilot State
  const [doctorInstructionText, setDoctorInstructionText] = useState<string>('');
  const [isSpeakingInstruction, setIsSpeakingInstruction] = useState(false);
  const [agentLang, setAgentLang] = useState<'kn-IN' | 'en-IN'>('kn-IN');
  const [isRecordingConsultVoice, setIsRecordingConsultVoice] = useState(false);
  const [isExecutingAgentAction, setIsExecutingAgentAction] = useState(false);
  const [agentStatusNote, setAgentStatusNote] = useState<string | null>(null);

  // Event handler for timeline events
  const handleTimelineEvent = useCallback(
    (event: any) => {
      setTimeline((prev) => {
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
    apiBaseUrl: effectiveApiBaseUrl,
    wsBaseUrl: effectiveWsBaseUrl,
    onTimelineEvent: handleTimelineEvent,
  });

  // Attach local and remote streams to video tags across perspectives
  useEffect(() => {
    if (localStream) {
      if (spokeLocalVideoRef.current) spokeLocalVideoRef.current.srcObject = localStream;
      if (doctorLocalVideoRef.current) doctorLocalVideoRef.current.srcObject = localStream;
    }
  }, [localStream, perspective]);

  useEffect(() => {
    if (remoteStream) {
      if (spokeRemoteVideoRef.current) spokeRemoteVideoRef.current.srcObject = remoteStream;
      if (doctorRemoteVideoRef.current) doctorRemoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, perspective]);

  // Audio/Camera toggles
  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMicMuted;
        setIsMicMuted(!isMicMuted);
      }
    }
  };

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
    const videoElem = spokeLocalVideoRef.current || doctorLocalVideoRef.current;
    const dataUrl = await captureAndSendStillPhoto(videoElem);
    if (dataUrl) {
      setAgentStatusNote('Clinical still photo captured and transmitted');
      setTimeout(() => setAgentStatusNote(null), 3000);
    }
  };

  // Voice Note Recorder (15s voice note with Safari MP4 + Chrome WebM)
  const startVoiceRecording = async () => {
    try {
      let stream = localStream;
      if (!stream || stream.getAudioTracks().length === 0) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        }
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const actualMime = recorder.mimeType || mimeType || 'audio/mp4';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          const timestamp = new Date().toLocaleTimeString();

          let transcript = '';
          try {
            const sttRes = await transcribeAudio(effectiveApiBaseUrl, audioBlob, 'kn-IN');
            if (sttRes?.transcript?.trim()) {
              transcript = sttRes.transcript.trim();
            }
          } catch (_) {}

          if (!transcript) {
            transcript = 'Spoke Audio Note: ರೋಗಿಗೆ ತೀವ್ರ ಎದೆನೋವು ಹಾಗೂ ಉಸಿರಾಟದ ತೊಂದರೆಯಿದೆ (Severe chest pain & dyspnea).';
          }

          if (currentTier === 4) {
            await outbox.queueOfflineItem({
              case_id: caseData.id,
              type: 'VOICE_NOTE',
              payload: { audioUrl: base64Audio, transcript, duration: 15 },
              timestamp,
            });
          }

          handleTimelineEvent({
            timestamp,
            type: 'VOICE_NOTE',
            transcript,
            audioUrl: base64Audio,
            tier: currentTier,
            content: `Voice note recorded (${role.toUpperCase()}): "${transcript}"`,
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

  // Spoke Symptom Voice STT
  const handleConsultVoiceSTT = async () => {
    if (isRecordingConsultVoice) {
      setIsRecordingConsultVoice(false);
      setAgentStatusNote('Transcribing voice via Sarvam AI...');
      try {
        const audioBlob = await stopAudioRecording();
        const res = await transcribeAudio(effectiveApiBaseUrl, audioBlob, agentLang);
        let transcript = res.transcript;
        if (!transcript) {
          transcript = await runBrowserSpeechRecognition(agentLang, 3500);
        }
        if (transcript) {
          const timestamp = new Date().toLocaleTimeString();
          handleTimelineEvent({
            timestamp,
            type: 'VOICE_TRANSLATION',
            role: 'Patient / Spoke Nurse',
            content: `[${agentLang === 'kn-IN' ? 'ಕನ್ನಡ' : 'English'}] "${transcript}"`,
            transcript,
            tier: currentTier,
          });
          setAgentStatusNote(`Transcribed: "${transcript.slice(0, 40)}..."`);
          setTimeout(() => setAgentStatusNote(null), 4000);
        } else {
          setAgentStatusNote(
            agentLang === 'kn-IN'
              ? 'ಧ್ವನಿ ಪತ್ತೆಯಾಗಿಲ್ಲ. ಮತ್ತೊಮ್ಮೆ ಮಾತನಾಡಿ (No speech detected)'
              : 'No speech detected. Please speak clearly into the mic.'
          );
          setTimeout(() => setAgentStatusNote(null), 4000);
        }
      } catch (err: any) {
        setAgentStatusNote(`Voice error: ${err.message}`);
        setTimeout(() => setAgentStatusNote(null), 4000);
      }
    } else {
      try {
        await startAudioRecording();
        setIsRecordingConsultVoice(true);
        setAgentStatusNote(`Listening in ${agentLang === 'kn-IN' ? 'Kannada' : 'English'}... Click again to finish`);
      } catch (err: any) {
        setAgentStatusNote('Mic access error, trying browser recognition fallback...');
        const text = await runBrowserSpeechRecognition(agentLang, 5000);
        if (text) {
          const timestamp = new Date().toLocaleTimeString();
          handleTimelineEvent({
            timestamp,
            type: 'VOICE_TRANSLATION',
            content: `"${text}"`,
            transcript: text,
            tier: currentTier,
          });
        }
      }
    }
  };

  // Doctor Spoken Instructions to Patient via Sarvam Bulbul TTS
  const handleDoctorSpeakInstruction = async (customText?: string) => {
    const textToSpeak = customText || doctorInstructionText;
    if (!textToSpeak.trim()) return;

    setIsSpeakingInstruction(true);
    try {
      await speakText(effectiveApiBaseUrl, textToSpeak, 'kn-IN');
      const timestamp = new Date().toLocaleTimeString();
      handleTimelineEvent({
        timestamp,
        type: 'DOCTOR_INSTRUCTION',
        role: 'Specialist Doctor',
        content: `👨‍⚕️ Specialist (Spoken in Kannada): "${textToSpeak}"`,
        tier: currentTier,
      });
      setDoctorInstructionText('');
      setAgentStatusNote('Instruction spoken in Kannada to patient via Sarvam Bulbul TTS!');
      setTimeout(() => setAgentStatusNote(null), 3500);
    } catch (err: any) {
      console.error('Doctor instruction speech error:', err);
      setAgentStatusNote(`TTS Error: ${err.message}`);
      setTimeout(() => setAgentStatusNote(null), 4000);
    } finally {
      setIsSpeakingInstruction(false);
    }
  };

  // AI Co-Pilot: Analyze & Log SOAP Note
  const handleExecuteSoapNote = async () => {
    setIsExecutingAgentAction(true);
    setAgentStatusNote('AI Co-Pilot synthesizing differential diagnosis & SOAP note...');

    try {
      const actionRes = await executeAutonomousAction(
        effectiveApiBaseUrl,
        `Evaluate ongoing consultation on ${caseData.id}. Review acute complaints and draft emergency medication orders.`,
        agentLang,
        'consult',
        caseData.id
      );

      const timestamp = new Date().toLocaleTimeString();
      const soapContent = actionRes.clinical_note || actionRes.spoken_reply || 'SOAP Note: Patient presents with acute symptoms. Vital signs abnormal. Emergency stabilization initiated.';

      handleTimelineEvent({
        timestamp,
        type: 'AI_CO_CONSULTANT',
        content: soapContent,
        recommendation: actionRes.recommendation,
        draft_rx: actionRes.draft_rx,
        tier: currentTier,
      });

      if (actionRes.draft_rx && actionRes.draft_rx.length > 0) {
        setRxMeds(actionRes.draft_rx);
      }
      if (actionRes.recommendation) {
        setRxAdvice(actionRes.recommendation);
      }

      setAgentStatusNote('SOAP Note logged & draft medication order updated!');
      setTimeout(() => setAgentStatusNote(null), 4000);

      if (actionRes.spoken_reply) {
        speakText(effectiveApiBaseUrl, actionRes.spoken_reply, agentLang, actionRes.audio_base64);
      }
    } catch (err: any) {
      setAgentStatusNote(`AI Co-Pilot error: ${err.message}`);
      setTimeout(() => setAgentStatusNote(null), 5000);
    } finally {
      setIsExecutingAgentAction(false);
    }
  };

  // 1-Click AI Auto-Draft Prescription
  const handleAutoDraftPrescription = () => {
    const symptomsStr = (caseData.symptoms || []).join(' ').toLowerCase();
    const isSnakebite = symptomsStr.includes('snake') || symptomsStr.includes('bite') || symptomsStr.includes('fang') || symptomsStr.includes('ಹಾವು');
    const isRespiratory = symptomsStr.includes('breath') || symptomsStr.includes('wheeze') || symptomsStr.includes('asthma') || symptomsStr.includes('ಉಸಿರಾಟ');

    if (isSnakebite) {
      setRxDiagnosis('Venomous Snakebite Envenomation (Neurotoxic / Hemotoxic)');
      setRxMeds([
        { name: 'Inj. Polyvalent Anti-Snake Venom (ASV)', dosage: '10 vials in 500ml Normal Saline', frequency: 'IV Infusion over 1 hr', duration: 'STAT', instructions: 'Monitor vitals every 15 mins for anaphylaxis' },
        { name: 'Inj. Tetanus Toxoid (TT)', dosage: '0.5 ml', frequency: 'STAT IM', duration: 'Once', instructions: 'Intramuscular injection' },
        { name: 'Inj. Neostigmine + Atropine', dosage: '0.5mg / 0.6mg', frequency: 'SOS if ptosis or respiratory weakness', duration: 'SOS', instructions: 'Slow IV push' },
      ]);
      setRxAdvice('Immobilize limb at heart level. Do NOT apply tourniquet or incise wound. Perform 20WBCT every 30 mins.');
      setRxFollowUp('Immediate emergency referral with cold-chain to District Hospital ICU');
    } else if (isRespiratory) {
      setRxDiagnosis('Acute Severe Asthma / Bronchial Exacerbation');
      setRxMeds([
        { name: 'Salbutamol + Ipratropium Nebulizer Solution', dosage: '2.5 mg / 0.5 mg', frequency: 'Nebulization Q20min x 3 doses', duration: '1 day', instructions: 'Deliver with 6-8 L/min Oxygen flow' },
        { name: 'Inj. Hydrocortisone', dosage: '100 mg', frequency: 'STAT IV Push', duration: 'Once', instructions: 'Slow IV injection over 3 mins' },
        { name: 'Tab. Prednisolone', dosage: '40 mg', frequency: 'OD after meals', duration: '5 days', instructions: 'Oral morning dose' },
      ]);
      setRxAdvice('Propped-up 45-degree Fowler position. Supplemental oxygen to keep SpO2 > 94%. Avoid cold air triggers.');
      setRxFollowUp('Review in 2 hours at PHC; transfer if respiratory rate > 30/min persists');
    } else {
      setRxDiagnosis('Acute Coronary Syndrome (Suspected STEMI / Acute Myocardial Infarction)');
      setRxMeds([
        { name: 'Tab. Aspirin (Disprin)', dosage: '325 mg', frequency: 'STAT (Chew immediately)', duration: '1 day', instructions: 'Chew with a sip of water' },
        { name: 'Tab. Clopidogrel', dosage: '300 mg', frequency: 'STAT (4 tabs of 75mg)', duration: '1 day', instructions: 'Take immediately' },
        { name: 'Tab. Atorvastatin', dosage: '80 mg', frequency: 'STAT', duration: '1 day', instructions: 'Take at night' },
        { name: 'Tab. Sorbitrate (Isosorbide Dinitrate)', dosage: '5 mg', frequency: 'SOS (if SBP > 100 mmHg)', duration: 'SOS', instructions: 'Sublingual (dissolve under tongue)' },
      ]);
      setRxAdvice('Strict bed rest. Continuous O2 at 4 L/min via nasal prongs. Keep 108 Emergency Ambulance ready for transfer to Mangalore.');
      setRxFollowUp('Immediate emergency transfer to District Specialist Hospital Cath Lab');
    }

    setAgentStatusNote('Prescription auto-drafted from patient clinical profile!');
    setTimeout(() => setAgentStatusNote(null), 3000);
  };

  // Sign & Issue e-Rx (calls POST /api/cases/{case_id}/prescribe)
  const handleSignAndIssueRx = async () => {
    setIsSigningRx(true);
    try {
      const payload = {
        diagnosis: rxDiagnosis,
        medications: rxMeds,
        advice: rxAdvice,
        follow_up: rxFollowUp,
        doctor_name: doctorName,
        doctor_reg: doctorReg,
      };

      const res = await fetch(`${effectiveApiBaseUrl}/api/cases/${caseData.id}/prescribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setSignedRxData({
        smsPreview: data.sms_preview,
        pdfUrl: `${effectiveApiBaseUrl}${data.pdf_url}`,
      });

      if (data.case) {
        onCaseUpdate?.(data.case);
      }

      handleTimelineEvent({
        timestamp: new Date().toLocaleTimeString(),
        type: 'PRESCRIPTION',
        content: `✅ e-Prescription signed by ${doctorName} (${doctorReg}): ${rxDiagnosis}`,
        tier: currentTier,
      });

      setAgentStatusNote('e-Prescription successfully signed! PDF, 2G SMS, and ABDM FHIR ready.');
      setTimeout(() => setAgentStatusNote(null), 5000);
    } catch (err: any) {
      console.error('Failed to sign prescription:', err);
      alert(`Could not sign prescription: ${err.message}`);
    } finally {
      setIsSigningRx(false);
    }
  };

  // Load ABDM FHIR R4 Bundle
  const handleFetchFhirBundle = async () => {
    setIsLoadingFhir(true);
    setShowFhirModal(true);
    try {
      const res = await fetch(`${effectiveApiBaseUrl}/api/cases/${caseData.id}/fhir`);
      if (res.ok) {
        const json = await res.json();
        setFhirJson(JSON.stringify(json, null, 2));
      } else {
        setFhirJson(JSON.stringify({ error: `Failed to fetch FHIR: HTTP ${res.status}` }, null, 2));
      }
    } catch (err: any) {
      setFhirJson(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsLoadingFhir(false);
    }
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
      content: `Offline vitals queued in IndexedDB: BP ${caseData.vitals.bp_systolic}/${caseData.vitals.bp_diastolic}, SpO2 ${caseData.vitals.spo2}%`,
      tier: 4,
    });
    setAgentStatusNote('Vitals saved to local offline store-and-forward outbox');
    setTimeout(() => setAgentStatusNote(null), 3000);
  };

  // Add medication row
  const handleAddMedication = () => {
    setRxMeds((prev) => [
      ...prev,
      { name: '', dosage: '', frequency: 'BD', duration: '5 days', instructions: 'After food' },
    ]);
  };

  // Remove medication row
  const handleRemoveMedication = (index: number) => {
    setRxMeds((prev) => prev.filter((_, i) => i !== index));
  };

  // Update medication row
  const handleUpdateMedication = (index: number, field: keyof MedicationItem, value: string) => {
    setRxMeds((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Vitals Red-Flag Check
  const isHighBp = caseData.vitals.bp_systolic > 140 || caseData.vitals.bp_diastolic > 90;
  const isLowSpo2 = caseData.vitals.spo2 < 92;
  const isHighHr = caseData.vitals.hr > 100;

  // ==========================================
  // RENDER: 🏥 PHC SPOKE PERSPECTIVE
  // ==========================================
  const renderSpokeStation = (isSplit = false) => {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          height: '100%',
          backgroundColor: '#0a0f1d',
          borderRadius: isSplit ? '12px' : '0',
          border: isSplit ? '1px solid #1e293b' : 'none',
          padding: isSplit ? '16px' : '18px 24px',
          overflowY: 'auto',
        }}
      >
        {/* Spoke Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                🏥 Sullia PHC Sub-Centre (Nurse & Patient Station)
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                ಗ್ರಾಮೀಣ ಆರೋಗ್ಯ ಕೇಂದ್ರ • {caseData.village_taluka}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: currentTier === 1 ? '#064e3b' : currentTier === 2 ? '#0c4a6e' : currentTier === 3 ? '#78350f' : '#7f1d1d',
                color: currentTier === 1 ? '#6ee7b7' : currentTier === 2 ? '#7dd3fc' : currentTier === 3 ? '#fde68a' : '#fca5a5',
                border: `1px solid ${currentTier === 1 ? '#059669' : currentTier === 2 ? '#0284c7' : currentTier === 3 ? '#d97706' : '#dc2626'}`,
              }}
            >
              Tier {currentTier} ({stats.bitrateKbps} kbps)
            </span>
          </div>
        </div>

        {/* Live Audio / Video Views */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            height: isSplit ? '220px' : '280px',
            maxHeight: isSplit ? '220px' : '280px',
            width: '100%',
            flexShrink: 0,
          }}
        >
          {/* Patient Local Camera */}
          <div
            style={{
              position: 'relative',
              backgroundColor: '#030712',
              borderRadius: '10px',
              border: '1px solid #1e293b',
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <video
              ref={spokeLocalVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: cameraFit,
                transform: 'scaleX(-1)',
                display: currentTier <= 2 ? 'block' : 'none',
              }}
            />
            {currentTier >= 3 && (
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <VideoOff size={32} color="#64748b" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                  Camera Disabled (Bandwidth Saved for Voice)
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Tier {currentTier} active ({stats.bitrateKbps} kbps)
                </div>
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              👤 Patient: {caseData.patient_name} (Self)
            </div>
          </div>

          {/* Remote Specialist Doctor View */}
          <div
            style={{
              position: 'relative',
              backgroundColor: '#030712',
              borderRadius: '10px',
              border: '1px solid #1e293b',
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <video
              ref={spokeRemoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: cameraFit,
                display: isPeerConnected && remoteStream && currentTier <= 2 ? 'block' : 'none',
              }}
            />

            {/* Telepresence feed if peer loopback */}
            {(!isPeerConnected || !remoteStream || currentTier >= 3) && (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#030712',
                }}
              >
                <img
                  src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=800&q=80"
                  alt="Doctor Stream"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: cameraFit,
                    filter: currentTier === 2 ? 'blur(1.5px)' : 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    backgroundColor: 'rgba(6,78,59,0.85)',
                    border: '1px solid #059669',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#6ee7b7',
                    fontWeight: 700,
                  }}
                >
                  LIVE • Mangalore District Hub
                </div>
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              👨‍⚕️ {doctorName}
            </div>
          </div>
        </div>

        {/* Media Controls Bar with Zoom/Framing Toggle */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleMic}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: isMicMuted ? '#7f1d1d' : '#1e293b',
              color: isMicMuted ? '#fca5a5' : '#f8fafc',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
            <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCam}
            disabled={currentTier >= 3}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: isCamOff || currentTier >= 3 ? '#334155' : '#1e293b',
              color: currentTier >= 3 ? '#64748b' : '#f8fafc',
              border: '1px solid #334155',
              cursor: currentTier >= 3 ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isCamOff || currentTier >= 3 ? <VideoOff size={14} /> : <Video size={14} />}
            <span>{currentTier >= 3 ? 'Video Off (Tier 3/4)' : isCamOff ? 'Turn Cam On' : 'Turn Cam Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCameraFit(cameraFit === 'contain' ? 'cover' : 'contain')}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Toggle video framing: Fit full camera or Fill box"
          >
            <span>{cameraFit === 'contain' ? '🔍 Zoom Out (Full Frame)' : '🔍 Fill Screen'}</span>
          </button>
        </div>

        {/* Spoke Action Controls (Kannada / English) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
          }}
        >
          {/* Snap Clinical Photo */}
          <button
            type="button"
            onClick={handleSnapPhoto}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
            }}
          >
            <Camera size={16} />
            <span>📸 Snap Clinical Photo for Doctor (Tier 3)</span>
          </button>

          {/* Speak Symptom via Sarvam STT */}
          <button
            type="button"
            onClick={handleConsultVoiceSTT}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: isRecordingConsultVoice ? '#dc2626' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: isRecordingConsultVoice ? '0 0 15px rgba(220, 38, 38, 0.6)' : 'none',
            }}
          >
            {isRecordingConsultVoice ? <MicOff size={16} /> : <Mic size={16} />}
            <span>
              {isRecordingConsultVoice
                ? 'ಮಾತನಾಡುವುದನ್ನು ನಿಲ್ಲಿಸಿ (Stop)'
                : '🎙️ Speak Symptom in Kannada/English (Sarvam STT)'}
            </span>
          </button>

          {/* Record 15s Clinical Voice Note */}
          <button
            type="button"
            onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: isRecordingVoice ? '#b91c1c' : '#4f46e5',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Volume2 size={16} />
            <span>
              {isRecordingVoice ? `Recording... (${voiceSecondsLeft}s)` : '📻 Record 15s Clinical Voice Note'}
            </span>
          </button>
        </div>

        {/* Patient Kannada Quick Speech Simulation Chips */}
        <div
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>
            ⚡ 1-Click Patient Voice Simulations (ಕನ್ನಡ / English):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                const text = 'ನಂಗೆ ಹುಷಾರಿಲ್ಲ, ಎದೆ ತುಂಬಾ ನೋಯುತ್ತಿದೆ ಮತ್ತು ಬೆವರು ಬರುತ್ತಿದೆ';
                handleTimelineEvent({
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'VOICE_TRANSLATION',
                  role: 'Patient (Sullia Spoke)',
                  content: `[ಕನ್ನಡ] "${text}"`,
                  transcript: text,
                  tier: currentTier,
                });
                setAgentStatusNote('Patient symptom logged in Kannada!');
                setTimeout(() => setAgentStatusNote(null), 3000);
              }}
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              "ನಂಗೆ ಹುಷಾರಿಲ್ಲ, ಎದೆ ತುಂಬಾ ನೋಯುತ್ತಿದೆ" (Chest pain & diaphoresis)
            </button>

            <button
              type="button"
              onClick={() => {
                const text = 'ತೋಟದಲ್ಲಿ ಹಾವು ಕಚ್ಚಿದೆ, ಕಾಲಿನಲ್ಲಿ ಊತ ಮತ್ತು ತೀವ್ರ ಉರಿತವಿದೆ';
                handleTimelineEvent({
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'VOICE_TRANSLATION',
                  role: 'Patient (Sullia Spoke)',
                  content: `[ಕನ್ನಡ] "${text}"`,
                  transcript: text,
                  tier: currentTier,
                });
                setAgentStatusNote('Snakebite symptom logged in Kannada!');
                setTimeout(() => setAgentStatusNote(null), 3000);
              }}
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#f59e0b',
                border: '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              "ಹಾವು ಕಚ್ಚಿದೆ, ಕಾಲಿನಲ್ಲಿ ಊತವಿದೆ" (Snakebite & local swelling)
            </button>
          </div>
        </div>

        {/* Tier 4 Offline Store-and-Forward Outbox */}
        <div
          style={{
            backgroundColor: currentTier === 4 ? '#3b0707' : '#0c111e',
            border: `1px solid ${currentTier === 4 ? '#dc2626' : '#1e293b'}`,
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Inbox size={16} color={currentTier === 4 ? '#f87171' : '#38bdf8'} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                Store-and-Forward Outbox (IndexedDB)
              </span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: outbox.pendingItems.length > 0 ? '#d97706' : '#1e293b',
                  color: outbox.pendingItems.length > 0 ? '#fff' : '#94a3b8',
                  fontWeight: 700,
                }}
              >
                {outbox.pendingItems.length} queued item(s)
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handleQueueOfflineVitals}
                style={{
                  fontSize: '11px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid #334155',
                  cursor: 'pointer',
                }}
              >
                + Queue Offline Vitals
              </button>

              <button
                type="button"
                onClick={() => outbox.flushOutbox(effectiveApiBaseUrl)}
                disabled={outbox.isSyncing || outbox.pendingItems.length === 0}
                style={{
                  fontSize: '11px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: outbox.pendingItems.length > 0 ? '#059669' : '#1e293b',
                  color: '#ffffff',
                  border: 'none',
                  cursor: outbox.pendingItems.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                }}
              >
                {outbox.isSyncing ? 'Syncing...' : 'Attempt Sync Now'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 }}>
            {currentTier === 4 ? (
              <span style={{ color: '#fca5a5' }}>
                ⚠️ <strong>Complete Ghat Network Disconnection (&lt;30 kbps).</strong> All captured still photos, audio notes, and vitals are securely cached in your browser. Automatic sync countdown resumes the moment signal exceeds 30 kbps. Zero restarts required.
              </span>
            ) : (
              <span>
                Active network connected (Tier {currentTier}). Outbox automatically flushes pending telemetry when connection restores.
              </span>
            )}
          </div>

          {outbox.pendingItems.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0' }}>
              {outbox.pendingItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>{item.type}</span>
                  <span style={{ color: '#94a3b8' }}>({item.timestamp.slice(-8)})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER: 👨‍⚕️ SPECIALIST DOCTOR WORKSTATION (3-COLUMN CLINICAL COCKPIT)
  // ==========================================
  const renderDoctorCockpit = () => {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(340px, 1.2fr) minmax(380px, 1.3fr)',
          gap: '14px',
          flex: '1 1 auto',
          padding: '16px',
          overflow: 'hidden',
          minHeight: 0,
          height: '100%',
          backgroundColor: '#070a13',
        }}
      >
        {/* ========================================================= */}
        {/* COL 1: Patient Live Feed & Diagnostic Media */}
        {/* ========================================================= */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#0c111e',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '14px',
            overflowY: 'auto',
            minHeight: 0,
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={16} color="#10b981" />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                Col 1: Patient Feed & Diagnostics
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Tier {currentTier} ({stats.bitrateKbps} kbps)
            </span>
          </div>

          {/* Video Stream Stage */}
          <div
            style={{
              position: 'relative',
              backgroundColor: '#030712',
              borderRadius: '10px',
              border: '1px solid #1e293b',
              height: '240px',
              maxHeight: '240px',
              width: '100%',
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Live WebRTC or Loopback Video */}
            <video
              ref={doctorRemoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: cameraFit,
                display: currentTier <= 2 ? 'block' : 'none',
                filter: currentTier === 2 ? 'blur(1.5px) contrast(0.95)' : 'none',
              }}
            />

            {/* Tier 3: Audio Waveform Simulator */}
            {currentTier === 3 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#1e140a',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '40px' }}>
                  {[18, 32, 44, 24, 38, 50, 20, 16, 42, 48, 28, 36, 19, 44].map((h, i) => (
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
                <span style={{ fontSize: '12px', color: '#fde68a', fontWeight: 700 }}>
                  Tier 3: Continuous Opus Audio Channel (24 kbps)
                </span>
              </div>
            )}

            {/* Tier 4: Store & Forward Disconnection */}
            {currentTier === 4 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#2d0606',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <AlertTriangle size={32} color="#ef4444" />
                <span style={{ fontSize: '13px', color: '#fca5a5', fontWeight: 700 }}>
                  Tier 4: Ghat Outage (&lt;30 kbps)
                </span>
                <span style={{ fontSize: '11px', color: '#fecaca' }}>
                  Store-and-forward outbox active. Ready to receive offline telemetry once reconnected.
                </span>
              </div>
            )}

            {/* Watermark badge */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                backgroundColor: 'rgba(0,0,0,0.75)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#38bdf8',
                fontWeight: 700,
              }}
            >
              Patient: {caseData.patient_name} ({caseData.age}/{caseData.gender})
            </div>
          </div>

          {/* Media Toggles & Request Still Snapshot Button */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={toggleMic}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: isMicMuted ? '#7f1d1d' : '#1e293b',
                color: isMicMuted ? '#fca5a5' : '#f8fafc',
                border: '1px solid #334155',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{isMicMuted ? 'Muted' : 'Mic On'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCameraFit(cameraFit === 'contain' ? 'cover' : 'contain')}
              style={{
                padding: '10px 10px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Toggle framing: contain full video or cover"
            >
              <span>{cameraFit === 'contain' ? '🔍 Zoom Out' : '🔍 Fill'}</span>
            </button>

            <button
              type="button"
              onClick={handleSnapPhoto}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Camera size={15} />
              <span>📸 Request Still Snapshot from Spoke</span>
            </button>
          </div>

          {/* Diagnostic Media Gallery (Tier 3 Still Photos & Tier 4 Voice Notes) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                High-Contrast Diagnostic Gallery ({recentPhotos.length} stills)
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>WebP 0.5q</span>
            </div>

            {recentPhotos.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  border: '1px dashed #334155',
                  borderRadius: '8px',
                  color: '#64748b',
                  fontSize: '11px',
                }}
              >
                No still photos received yet. Click "Request Still Snapshot" above.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {recentPhotos.map((photo, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedPhotoModal(photo.url)}
                    style={{
                      position: 'relative',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid #334155',
                    }}
                  >
                    <img
                      src={photo.url}
                      alt="Clinical Still"
                      style={{ width: '100%', height: '80px', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: 'rgba(0,0,0,0.75)',
                        fontSize: '9px',
                        color: '#f8fafc',
                        padding: '2px 4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{photo.sender}</span>
                      <span>{photo.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* COL 2: Bilingual AI Co-Consultant & Live Kannada ↔ English Bridge */}
        {/* ========================================================= */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#0c111e',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '14px',
            overflowY: 'auto',
            minHeight: 0,
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={16} color="#38bdf8" />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                Col 2: Bilingual Kannada ↔ English Bridge
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAgentLang(agentLang === 'kn-IN' ? 'en-IN' : 'kn-IN')}
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              {agentLang === 'kn-IN' ? 'ಕನ್ನಡ (kn-IN)' : 'English (en-IN)'}
            </button>
          </div>

          {/* Doctor Instruction Input with Sarvam Bulbul TTS */}
          <div
            style={{
              backgroundColor: '#080d1a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
              Doctor Spoken Instruction (Broadcasts in Kannada to Patient):
            </div>
            <textarea
              rows={2}
              value={doctorInstructionText}
              onChange={(e) => setDoctorInstructionText(e.target.value)}
              placeholder="Type instructions in English or Kannada (e.g. 'ದಯವಿಟ್ಟು ರೋಗಿಗೆ ತಕ್ಷಣ ಆಸ್ಪಿರಿನ್ ನೀಡಿ ಮತ್ತು ಮಲಗಿಸಿ')..."
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                fontSize: '12px',
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleDoctorSpeakInstruction()}
                disabled={isSpeakingInstruction || !doctorInstructionText.trim()}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  cursor: isSpeakingInstruction || !doctorInstructionText.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Volume2 size={13} />
                <span>{isSpeakingInstruction ? 'Speaking...' : '🔊 Speak in Kannada (TTS)'}</span>
              </button>

              <button
                type="button"
                onClick={handleExecuteSoapNote}
                disabled={isExecutingAgentAction}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  cursor: isExecutingAgentAction ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                {isExecutingAgentAction ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                <span>🤖 AI Co-Pilot: SOAP Note</span>
              </button>
            </div>

            {/* Quick Instruction Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => handleDoctorSpeakInstruction('ದಯವಿಟ್ಟು ರೋಗಿಗೆ ತಕ್ಷಣ ಆಸ್ಪಿರಿನ್ 325 ಮಿಲಿಗ್ರಾಂ ಮಾತ್ರೆ ನೀಡಿ')}
                style={{
                  fontSize: '10px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid #334155',
                  cursor: 'pointer',
                }}
              >
                ⚡ "Aspirin 325mg stat ಕೊಡಿ"
              </button>
              <button
                type="button"
                onClick={() => handleDoctorSpeakInstruction('ರೋಗಿಯನ್ನು ಶಾಂತವಾಗಿ ಮಲಗಿಸಿ, ಗಾಬರಿ ಬೇಡ')}
                style={{
                  fontSize: '10px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid #334155',
                  cursor: 'pointer',
                }}
              >
                ⚡ "ರೋಗಿಯನ್ನು ಮಲಗಿಸಿ"
              </button>
              <button
                type="button"
                onClick={() => handleDoctorSpeakInstruction('108 ಆಂಬ್ಯುಲೆನ್ಸ್ ರವಾನಿಸಲಾಗಿದೆ, ಸಿದ್ಧವಾಗಿರಿ')}
                style={{
                  fontSize: '10px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: '#f87171',
                  border: '1px solid #334155',
                  cursor: 'pointer',
                }}
              >
                ⚡ "108 ಆಂಬ್ಯುಲೆನ್ಸ್ ಬರುತ್ತಿದೆ"
              </button>
            </div>
          </div>

          {/* Real-Time Consultation Timeline Stream */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Clock size={12} />
              <span>Consultation Activity Stream ({timeline.length} events)</span>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
              }}
            >
              {timeline.map((evt, idx) => {
                const isInstruction = evt.type === 'DOCTOR_INSTRUCTION';
                const isSoap = evt.type === 'AI_CO_CONSULTANT';
                const isRx = evt.type === 'PRESCRIPTION';
                const isVoice = evt.type === 'VOICE_TRANSLATION' || evt.type === 'VOICE_NOTE';
                const isPhoto = evt.type === 'PHOTO';
                const isTier = evt.type === 'TIER_CHANGE';
                const isSynced = evt.type === 'OUTBOX_SYNCED';

                return (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: isInstruction ? '#0c2238' : isSoap ? '#022c22' : isRx ? '#1e1b4b' : '#0f172a',
                      border: `1px solid ${isInstruction ? '#0284c7' : isSoap ? '#059669' : isRx ? '#6366f1' : '#1e293b'}`,
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {isVoice && <Mic size={11} color="#a855f7" />}
                        {isPhoto && <Camera size={11} color="#38bdf8" />}
                        {isTier && <Layers size={11} color="#f59e0b" />}
                        {isSynced && <CheckCircle2 size={11} color="#10b981" />}
                        {!isVoice && !isPhoto && !isTier && !isSynced && <Activity size={11} color="#94a3b8" />}
                        <span style={{ fontWeight: 700, color: isInstruction ? '#38bdf8' : isSoap ? '#34d399' : isRx ? '#818cf8' : '#94a3b8' }}>
                          {evt.type}
                        </span>
                      </div>
                      <span style={{ fontSize: '9px', color: '#64748b' }}>{evt.timestamp}</span>
                    </div>
                    <div style={{ color: '#e2e8f0', lineHeight: 1.3 }}>
                      {evt.content || evt.transcript}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* COL 3: Inline Doctor's Clinical Pad & 1-Click e-Prescription */}
        {/* ========================================================= */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#0c111e',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '14px',
            overflowY: 'auto',
            minHeight: 0,
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={16} color="#10b981" />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                Col 3: Clinical Pad & 1-Click e-Rx
              </span>
            </div>
            <button
              type="button"
              onClick={handleAutoDraftPrescription}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#d97706',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Sparkles size={12} />
              <span>⚡ 1-Click AI Auto-Draft</span>
            </button>
          </div>

          {/* Vitals Ribbon with Red-Flag Highlights */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              backgroundColor: '#080d1a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '8px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>BP (mmHg)</div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: isHighBp ? '#f87171' : '#f8fafc',
                }}
              >
                {caseData.vitals.bp_systolic}/{caseData.vitals.bp_diastolic}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>SpO2 (%)</div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: isLowSpo2 ? '#f87171' : '#f8fafc',
                }}
              >
                {caseData.vitals.spo2}%
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>HR (bpm)</div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: isHighHr ? '#f87171' : '#f8fafc',
                }}
              >
                {caseData.vitals.hr}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>Temp</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                {caseData.vitals.temp_f}°F
              </div>
            </div>
          </div>

          {/* Gemini Flash Clinical Pre-Brief */}
          {caseData.ai_clinical_brief && (
            <div
              style={{
                backgroundColor: '#172554',
                border: '1px solid #1d4ed8',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '11px',
                color: '#bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span>{caseData.ai_clinical_brief}</span>
              <button
                type="button"
                onClick={() => speakText(effectiveApiBaseUrl, caseData.ai_clinical_brief!, 'en-IN')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#60a5fa',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <Volume2 size={14} />
              </button>
            </div>
          )}

          {/* Interactive e-Prescription Pad */}
          <div
            style={{
              backgroundColor: '#080d1a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Clinical Diagnosis
              </label>
              <input
                type="text"
                value={rxDiagnosis}
                onChange={(e) => setRxDiagnosis(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Doctor Info Editable Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <label style={{ fontSize: '10px', color: '#94a3b8' }}>Signing Doctor</label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: '2px',
                    padding: '5px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '11px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: '#94a3b8' }}>Medical Council Reg #</label>
                <input
                  type="text"
                  value={doctorReg}
                  onChange={(e) => setDoctorReg(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: '2px',
                    padding: '5px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '11px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Medications Table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Prescribed Generic Medications ({rxMeds.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddMedication}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                >
                  <Plus size={12} /> Add Drug
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {rxMeds.map((med, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 24px',
                      gap: '4px',
                      alignItems: 'center',
                      backgroundColor: '#0f172a',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Medication name"
                      value={med.name}
                      onChange={(e) => handleUpdateMedication(idx, 'name', e.target.value)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#f8fafc',
                        fontSize: '11px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Dosage"
                      value={med.dosage}
                      onChange={(e) => handleUpdateMedication(idx, 'dosage', e.target.value)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '11px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Frequency"
                      value={med.frequency}
                      onChange={(e) => handleUpdateMedication(idx, 'frequency', e.target.value)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '11px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMedication(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '2px',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Advice & Follow-Up */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <label style={{ fontSize: '10px', color: '#94a3b8' }}>Clinical Advice</label>
                <input
                  type="text"
                  value={rxAdvice}
                  onChange={(e) => setRxAdvice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '11px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: '#94a3b8' }}>Follow-Up Plan</label>
                <input
                  type="text"
                  value={rxFollowUp}
                  onChange={(e) => setRxFollowUp(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '11px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Inline Sign & Issue e-Rx Button */}
            <button
              type="button"
              onClick={handleSignAndIssueRx}
              disabled={isSigningRx}
              style={{
                marginTop: '4px',
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                cursor: isSigningRx ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.4)',
              }}
            >
              {isSigningRx ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              <span>{isSigningRx ? 'Signing e-Rx...' : '✅ Sign & Issue e-Rx (PDF + 2G SMS + ABDM FHIR)'}</span>
            </button>

            {/* Post-Signing Direct Action Links */}
            {signedRxData && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid #1e293b',
                }}
              >
                <a
                  href={`${effectiveApiBaseUrl}/api/cases/${caseData.id}/prescription.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '8px 6px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    border: '1px solid #334155',
                    fontSize: '10px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Download size={12} />
                  <span>Download PDF</span>
                </a>

                <button
                  type="button"
                  onClick={() => setShowSmsModal(true)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#f59e0b',
                    border: '1px solid #334155',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Smartphone size={12} />
                  <span>Preview 2G SMS</span>
                </button>

                <button
                  type="button"
                  onClick={handleFetchFhirBundle}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#a855f7',
                    border: '1px solid #334155',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <FileCode size={12} />
                  <span>ABDM FHIR JSON</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER: 🖥️ SPLIT-SCREEN DEMO MODE
  // ==========================================
  const renderSplitScreen = () => {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1fr) minmax(580px, 1.4fr)',
          gap: '14px',
          flex: '1 1 auto',
          padding: '16px',
          overflow: 'hidden',
          minHeight: 0,
          height: '100%',
          backgroundColor: '#070a13',
        }}
      >
        {/* Left Side: PHC Spoke Card */}
        {renderSpokeStation(true)}

        {/* Right Side: Doctor Workstation Cockpit */}
        <div style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}>
          {renderDoctorCockpit()}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: 'calc(100vh - 65px)',
        overflow: 'hidden',
        backgroundColor: '#070a13',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* 1. Top Clinical Identification & Perspective Switcher Bar */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
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
                fontSize: '15px',
                boxShadow: '0 0 12px rgba(37, 99, 235, 0.5)',
              }}
            >
              TT
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>TeleThread</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  Case #{caseData.id}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                4-Tier Telemedicine Engine • Sullia Ghat
              </div>
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#334155' }} />

          {/* Patient Quick Glance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} color="#38bdf8" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                {caseData.patient_name}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                ({caseData.age}/{caseData.gender})
              </span>
            </div>

            <span
              style={{
                fontSize: '11px',
                color: '#cbd5e1',
                backgroundColor: '#1e293b',
                padding: '2px 8px',
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
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                <AlertTriangle size={11} />
                CRITICAL
              </span>
            )}
          </div>
        </div>

        {/* ROLE PERSPECTIVE SWITCHER TABS */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#030712',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #334155',
            gap: '3px',
          }}
        >
          <button
            type="button"
            onClick={() => setPerspective('spoke')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: perspective === 'spoke' ? '#0284c7' : 'transparent',
              color: perspective === 'spoke' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s ease',
            }}
          >
            🏥 PHC Spoke (Nurse/Patient)
          </button>

          <button
            type="button"
            onClick={() => setPerspective('doctor')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: perspective === 'doctor' ? '#059669' : 'transparent',
              color: perspective === 'doctor' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s ease',
            }}
          >
            👨‍⚕️ Specialist Doctor Workstation
          </button>

          <button
            type="button"
            onClick={() => setPerspective('split')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: perspective === 'split' ? '#7c3aed' : 'transparent',
              color: perspective === 'split' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s ease',
            }}
          >
            🖥️ Split-Screen Demo Mode
          </button>
        </div>

        {/* Exit Button */}
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#334155',
              color: '#f8fafc',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Exit
          </button>
        )}
      </header>

      {/* 2. Sticky Network Simulator HUD */}
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

      {/* Notification Toast */}
      {agentStatusNote && (
        <div
          style={{
            backgroundColor: '#0c4a6e',
            color: '#7dd3fc',
            padding: '6px 16px',
            fontSize: '12px',
            fontWeight: 600,
            textAlign: 'center',
            borderBottom: '1px solid #0284c7',
          }}
        >
          ℹ️ {agentStatusNote}
        </div>
      )}

      {/* 3. Main Perspective View (Bounded to viewport with minHeight 0) */}
      <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {perspective === 'spoke' && renderSpokeStation(false)}
        {perspective === 'doctor' && renderDoctorCockpit()}
        {perspective === 'split' && renderSplitScreen()}
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

      {/* 5. 2G SMS Preview Modal */}
      {showSmsModal && (
        <div
          onClick={() => setShowSmsModal(false)}
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
              maxWidth: '520px',
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
                padding: '14px 16px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={16} color="#f59e0b" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                  2G GSM SMS Prescription Preview (160 Chars)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSmsModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                This condensed bilingual SMS is delivered over standard 2G GSM cellular towers in forested Ghat valleys without requiring internet data access.
              </div>

              {/* Feature Phone Screen Simulation */}
              <div
                style={{
                  backgroundColor: '#042f2e',
                  border: '2px solid #0d9488',
                  borderRadius: '8px',
                  padding: '14px',
                  color: '#ccfbf1',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {signedRxData?.smsPreview ||
                  `[TELETHREAD e-Rx] Case #${caseData.id}
Pt: ${caseData.patient_name} (${caseData.age}/${caseData.gender})
Rx: ${rxDiagnosis}
Meds: ${rxMeds.map((m) => `${m.name} ${m.dosage}`).join(', ')}
Dr: ${doctorName} (${doctorReg})
Ph: District Hospital Mangalore`}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const text =
                      signedRxData?.smsPreview ||
                      `[TELETHREAD e-Rx] Case #${caseData.id}\nPt: ${caseData.patient_name}\nRx: ${rxDiagnosis}\nDr: ${doctorName}`;
                    navigator.clipboard.writeText(text);
                    setSmsCopied(true);
                    setTimeout(() => setSmsCopied(false), 2500);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {smsCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{smsCopied ? 'Copied to Clipboard!' : 'Copy SMS Text'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. ABDM FHIR R4 JSON Modal */}
      {showFhirModal && (
        <div
          onClick={() => setShowFhirModal(false)}
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
              maxWidth: '780px',
              width: '100%',
              backgroundColor: '#0f172a',
              borderRadius: '12px',
              border: '1px solid #334155',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={16} color="#a855f7" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                  ABDM / HL7 FHIR R4 Diagnostic & Medication Bundle
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowFhirModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Conforms with the Ayushman Bharat Digital Mission (ABDM) FHIR R4 specification, including Patient, DiagnosticReport, and MedicationRequest resources.
              </div>

              {isLoadingFhir ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                  <Loader2 size={24} className="animate-spin" color="#38bdf8" />
                </div>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#030712',
                    border: '1px solid #1e293b',
                    color: '#7dd3fc',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    maxHeight: '400px',
                  }}
                >
                  {fhirJson || '{\n  "resourceType": "Bundle",\n  "type": "document"\n}'}
                </pre>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(fhirJson);
                    setFhirCopied(true);
                    setTimeout(() => setFhirCopied(false), 2500);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {fhirCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{fhirCopied ? 'Copied FHIR JSON!' : 'Copy FHIR JSON'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
