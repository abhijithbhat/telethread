import { useState, useEffect } from 'react';
import {
  Bot,
  Mic,
  MicOff,
  CheckCircle2,
  Play,
  Key,
  Volume2,
  X,
  Send,
  Loader2,
  RefreshCw,
  Plus,
  ArrowRight,
  Stethoscope,
} from 'lucide-react';
import {
  startAudioRecording,
  stopAudioRecording,
  transcribeAudio,
  runBrowserSpeechRecognition,
  speakText,
  executeAutonomousAction,
  fetchSarvamKeyStatus,
  addSarvamKeys,
  type SarvamKeyStatus,
  type AutonomousActionResponse,
} from '../utils/voiceService';

interface AutonomousAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl: string;
  lang?: 'en' | 'kn';
  onCaseCreated?: (caseData: any) => void;
  currentCaseId?: string;
  defaultMode?: 'triage' | 'consult';
}

export function AutonomousAgentModal({
  isOpen,
  onClose,
  apiBaseUrl,
  lang = 'en',
  onCaseCreated,
  currentCaseId,
  defaultMode = 'triage',
}: AutonomousAgentModalProps) {
  const [mode, setMode] = useState<'triage' | 'consult'>(defaultMode);
  const [selectedLang, setSelectedLang] = useState<'kn-IN' | 'en-IN'>(lang === 'kn' ? 'kn-IN' : 'en-IN');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [utterance, setUtterance] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<AutonomousActionResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Key Pool Management
  const [showKeyPool, setShowKeyPool] = useState(false);
  const [keyStatus, setKeyStatus] = useState<SarvamKeyStatus>({
    total_keys: 0,
    active_key_index: 0,
    has_keys: false,
    masked_active_key: null,
  });
  const [newKeysInput, setNewKeysInput] = useState('');
  const [keySuccessMsg, setKeySuccessMsg] = useState<string | null>(null);

  const isKn = selectedLang === 'kn-IN';

  // Load key pool status on open
  useEffect(() => {
    if (isOpen) {
      loadKeyStatus();
    }
  }, [isOpen, apiBaseUrl]);

  // Recording timer
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const loadKeyStatus = async () => {
    const status = await fetchSarvamKeyStatus(apiBaseUrl);
    setKeyStatus(status);
  };

  const handleAddKeys = async () => {
    if (!newKeysInput.trim()) return;
    try {
      const res = await addSarvamKeys(apiBaseUrl, newKeysInput);
      setKeyStatus(res.key_pool);
      setNewKeysInput('');
      setKeySuccessMsg(`Added keys! Total active: ${res.key_pool.total_keys}`);
      setTimeout(() => setKeySuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(`Failed to add keys: ${err.message}`);
    }
  };

  const handleStartRecording = async () => {
    setErrorMsg(null);
    setResult(null);
    try {
      await startAudioRecording();
      setIsRecording(true);
    } catch (err: any) {
      setErrorMsg(`Microphone access error: ${err.message}. Using browser recognition fallback.`);
      // Run browser recognition directly
      const text = await runBrowserSpeechRecognition(selectedLang, 6000);
      if (text) {
        setUtterance(text);
        handleExecute(text);
      }
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setIsProcessing(true);

    try {
      const audioBlob = await stopAudioRecording();
      // Call Sarvam STT
      const stt = await transcribeAudio(apiBaseUrl, audioBlob, selectedLang);
      let text = stt.transcript;

      // If STT returned empty, attempt browser recognition
      if (!text) {
        text = await runBrowserSpeechRecognition(selectedLang, 4000);
      }

      if (text) {
        setUtterance(text);
        await handleExecute(text);
      } else {
        setErrorMsg(
          isKn
            ? 'ಧ್ವನಿ ಗುರುತಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಮಾತನಾಡಿ ಅಥವಾ ಕೆಳಗಿನ 1-ಕ್ಲಿಕ್ ಡೆಮೊ ಬಳಸಿ.'
            : 'Could not transcribe speech. Please try again or use the 1-click simulation chips below.'
        );
      }
    } catch (err: any) {
      const isColdOrBlocked =
        err.message?.includes('Load failed') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError');
      const hint = isColdOrBlocked
        ? ` (Connecting to ${apiBaseUrl}. If Render backend was asleep, please allow ~20-30s for the free container to wake up and retry).`
        : '';
      setErrorMsg(`Audio processing failed: ${err.message}${hint}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecute = async (commandToExecute?: string) => {
    const text = (commandToExecute || utterance).trim();
    if (!text) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const actionRes = await executeAutonomousAction(
        apiBaseUrl,
        text,
        selectedLang,
        mode,
        currentCaseId
      );
      setResult(actionRes);

      // Speak back response automatically using Sarvam Bulbul TTS
      if (actionRes.spoken_reply) {
        speakText(apiBaseUrl, actionRes.spoken_reply, selectedLang, actionRes.audio_base64);
      }
    } catch (err: any) {
      const isColdOrBlocked =
        err.message?.includes('Load failed') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError');
      const hint = isColdOrBlocked
        ? ` (Could not reach ${apiBaseUrl}. If Render free-tier was asleep, please wait ~20-30s for the container to wake up and try again).`
        : '';
      setErrorMsg(`Autonomous action failed: ${err.message}${hint}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunPreset = (presetText: string) => {
    setUtterance(presetText);
    handleExecute(presetText);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          backgroundColor: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 0 15px rgba(59, 130, 246, 0.5)',
              }}
            >
              <Bot size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>
                  {isKn ? 'ಟೆಲಿಥ್ರೆಡ್ ಸ್ವಾಯತ್ತ ಕ್ಲಿನಿಕಲ್ ಏಜೆಂಟ್' : 'TeleThread Autonomous Clinical Agent'}
                </h3>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#1e3a8a',
                    color: '#93c5fd',
                  }}
                >
                  Sarvam Saaras v3 + Bulbul
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                {isKn
                  ? 'ಕನ್ನಡ ಮತ್ತು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಧ್ವನಿ ಆಧಾರಿತ ತುರ್ತು ಟ್ರಯೇಜ್ ಮತ್ತು ಸಮಾಲೋಚನೆ ಸಹ-ಪೈಲಟ್'
                  : 'Zero-touch voice triage & live consultation co-pilot in Kannada & English'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Key Pool Button */}
            <button
              type="button"
              onClick={() => setShowKeyPool(!showKeyPool)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: keyStatus.has_keys ? '#064e3b' : '#334155',
                color: keyStatus.has_keys ? '#6ee7b7' : '#cbd5e1',
                border: `1px solid ${keyStatus.has_keys ? '#059669' : '#475569'}`,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              <Key size={13} />
              <span>Keys ({keyStatus.total_keys})</span>
            </button>

            {/* Language Switch */}
            <button
              type="button"
              onClick={() => setSelectedLang(selectedLang === 'kn-IN' ? 'en-IN' : 'kn-IN')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {selectedLang === 'kn-IN' ? 'ಕನ್ನಡ (kn-IN)' : 'English (en-IN)'}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Key Pool Collapsible Section */}
          {showKeyPool && (
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: '#070a13',
                border: '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
                  🔑 Sarvam AI Multi-Key Pool Status (Failover Rotator)
                </span>
                <button
                  type="button"
                  onClick={loadKeyStatus}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                Backend API: <code style={{ color: '#38bdf8', backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px' }}>{apiBaseUrl}</code>
              </div>

              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
                Sarvam Pool: <strong style={{ color: keyStatus.has_keys ? '#34d399' : '#f87171' }}>
                  {keyStatus.has_keys
                    ? `Active (${keyStatus.total_keys} keys). Current: Key #${keyStatus.active_key_index + 1}`
                    : 'No API keys registered (Click below or paste Sarvam key)'}
                </strong>
                {keyStatus.masked_active_key && ` • Active: ${keyStatus.masked_active_key}`}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Paste Sarvam API Key(s) (comma-separated)..."
                  value={newKeysInput}
                  onChange={(e) => setNewKeysInput(e.target.value)}
                  style={{
                    flex: '1 1 auto',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#ffffff',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddKeys}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> Add Keys
                </button>
              </div>

              {keySuccessMsg && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#34d399', fontWeight: 600 }}>
                  ✓ {keySuccessMsg}
                </div>
              )}
            </div>
          )}

          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setMode('triage')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: mode === 'triage' ? '#1e3a8a' : '#0f172a',
                color: mode === 'triage' ? '#ffffff' : '#94a3b8',
                border: `1px solid ${mode === 'triage' ? '#3b82f6' : '#1e293b'}`,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Stethoscope size={15} />
              {isKn ? '1. ಸ್ವಾಯತ್ತ ರೋಗಿ ನೋಂದಣಿ (Triage)' : '1. Autonomous Patient Intake (Triage)'}
            </button>

            <button
              type="button"
              onClick={() => setMode('consult')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: mode === 'consult' ? '#1e3a8a' : '#0f172a',
                color: mode === 'consult' ? '#ffffff' : '#94a3b8',
                border: `1px solid ${mode === 'consult' ? '#3b82f6' : '#1e293b'}`,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Bot size={15} />
              {isKn ? '2. ಲೈವ್ ಸಮಾಲೋಚನೆ ಸಹ-ಪೈಲಟ್ (Consult)' : '2. Live Consultation Co-Pilot (Consult)'}
            </button>
          </div>

          {/* Mic Record Hero Area */}
          <div
            style={{
              padding: '24px',
              borderRadius: '14px',
              backgroundColor: '#070a13',
              border: isRecording ? '2px solid #ef4444' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative',
              boxShadow: isRecording ? '0 0 30px rgba(239, 68, 68, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Pulsing Mic Button */}
            <button
              type="button"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                backgroundColor: isRecording ? '#dc2626' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isRecording
                  ? '0 0 25px rgba(239, 68, 68, 0.8)'
                  : '0 0 25px rgba(37, 99, 235, 0.6)',
                transition: 'all 0.15s ease',
              }}
              title={isRecording ? 'Click to stop & execute' : 'Click to start speaking'}
            >
              {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
            </button>

            <div style={{ marginTop: '12px', fontWeight: 800, fontSize: '15px', color: '#ffffff' }}>
              {isRecording
                ? `${isKn ? 'ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದೆ...' : 'Listening...'} (${recordingSeconds}s)`
                : isKn
                ? 'ಧ್ವನಿ ಆಜ್ಞೆ ನೀಡಲು ಮೈಕ್ರೋಫೋನ್ ಒತ್ತಿರಿ'
                : 'Click Mic & Speak in Kannada or English'}
            </div>

            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              {isKn
                ? 'ಉದಾಹರಣೆ: "ತುರ್ತು ಕೇಸ್ ದಾಖಲಿಸಿ, ರೋಗಿ ರಮೇಶ್ ಗೌಡ, ಸುಳ್ಯ, ಎದೆ ನೋವು ಮತ್ತು ಬೆವರು"'
                : 'Say: "Register emergency patient Ramesh Gowda, 54M, Sullia, acute chest pain & suspected snakebite"'}
            </p>

            {/* Utterance Input & Submit */}
            <div style={{ width: '100%', marginTop: '16px', display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder={isKn ? 'ಅಥವಾ ಧ್ವನಿ ಪಠ್ಯವನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ...' : 'Or type the command here...'}
                value={utterance}
                onChange={(e) => setUtterance(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
                style={{
                  flex: '1 1 auto',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                onClick={() => handleExecute()}
                disabled={isProcessing || !utterance.trim()}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  backgroundColor: isProcessing || !utterance.trim() ? '#334155' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  cursor: isProcessing || !utterance.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                {isKn ? 'ಕಾರ್ಯಗತಗೊಳಿಸಿ' : 'Execute'}
              </button>
            </div>
          </div>

          {/* 1-Click Simulation Chips */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>
              {isKn ? '⚡ 1-ಕ್ಲಿಕ್ ಜಡ್ಜ್ ಸಿಮ್ಯುಲೇಶನ್ ಆಜ್ಞೆಗಳು:' : '⚡ 1-Click Judge Demo Voice Presets:'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() =>
                  handleRunPreset(
                    'ತುರ್ತು ಕೇಸ್ ದಾಖಲಿಸಿ! ರೋಗಿ ರಮೇಶ್ ಗೌಡ, 54 ವರ್ಷ, ಸುಳ್ಯ ಪ್ರಾಥಮಿಕ ಕೇಂದ್ರ. ತೀವ್ರ ಎದೆ ನೋವು, ಬೆವರು ಮತ್ತು ಹಾವು ಕಡಿತ. SpO2 89%, BP 185/110. ನೀವೇ ಎಲ್ಲಾ ಕೆಲಸ ಮಾಡಿ!'
                  )
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#1e1b4b',
                  border: '1px solid #4338ca',
                  color: '#c7d2fe',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  🚨 <strong>Critical Triage (Kannada):</strong> ರಮೇಶ್ ಗೌಡ ಸುಳ್ಯ — ಎದೆ ನೋವು & ಹಾವು ಕಡಿತ (SpO2 89%, BP 185/110)
                </span>
                <ArrowRight size={14} color="#818cf8" />
              </button>

              <button
                type="button"
                onClick={() =>
                  handleRunPreset(
                    'Critical patient at Sullia PHC! Ramesh Gowda, 54 male, acute crushing chest pain, SpO2 89, BP 185/110, suspected viper bite. Auto-run full emergency triage and route to Specialist Hub!'
                  )
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#450a0a',
                  border: '1px solid #dc2626',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  🐍 <strong>Critical Snakebite (English):</strong> Ramesh Gowda, 54M — STEMI + Viper Envenomation (Auto-Route)
                </span>
                <ArrowRight size={14} color="#f87171" />
              </button>

              <button
                type="button"
                onClick={() =>
                  handleRunPreset(
                    'Patient Manjula Nayak, 36F from Karkala Ghat PHC with persistent skin rash and mild fever. SpO2 98%, BP 120/80. Enqueue for specialist review.'
                  )
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#064e3b',
                  border: '1px solid #059669',
                  color: '#a7f3d0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  🌱 <strong>Routine Intake (English):</strong> Manjula Nayak, 36F — Karkala Ghat PHC (Dermatology Queue)
                </span>
                <ArrowRight size={14} color="#34d399" />
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#450a0a',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Autonomous Step-by-Step Execution Output */}
          {result && (
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: '#070a13',
                border: '1px solid #22c55e',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 0 25px rgba(34, 197, 94, 0.2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#4ade80' }}>
                  ✓ {isKn ? 'ಸ್ವಾಯತ್ತ ಏಜೆಂಟ್ ಕಾರ್ಯಗತಗೊಳಿಸಿದ ಕ್ರಮಗಳು' : 'Autonomous Action Execution Steps:'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    speakText(apiBaseUrl, result.spoken_reply, selectedLang, result.audio_base64)
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#14532d',
                    color: '#86efac',
                    border: '1px solid #16a34a',
                    cursor: 'pointer',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Volume2 size={13} /> {isKn ? 'ಮತ್ತೊಮ್ಮೆ ಆಲಿಸಿ' : 'Replay Sarvam TTS'}
                </button>
              </div>

              {/* Steps Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.agent_steps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                    <CheckCircle2 size={15} color="#22c55e" />
                    <span style={{ color: '#f8fafc' }}>{step}</span>
                  </div>
                ))}
              </div>

              {/* Spoken Reply Text Box */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  borderLeft: '4px solid #38bdf8',
                  fontSize: '13px',
                  color: '#e2e8f0',
                  lineHeight: 1.5,
                }}
              >
                <em>"{result.spoken_reply}"</em>
              </div>

              {/* Created / Updated Case Summary CTA */}
              {result.created_case && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Created Case ID:</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8' }}>
                      {result.created_case.id} — {result.created_case.patient_name} ({result.created_case.age}{result.created_case.gender})
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onCaseCreated) {
                        onCaseCreated(result.created_case);
                      }
                      onClose();
                    }}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
                    }}
                  >
                    <Play size={15} />
                    {isKn ? 'ತಕ್ಷಣ ಸಮಾಲೋಚನೆಗೆ ಪ್ರವೇಶಿಸಿ >' : 'Enter Live Consult Stage >'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
