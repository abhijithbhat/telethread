/**
 * TeleThread Voice Service & Sarvam AI Integration
 *
 * Provides:
 * - MediaRecorder audio capture (audio/webm)
 * - Sarvam AI Speech-to-Text (/api/agent/stt) with webkitSpeechRecognition local fallback
 * - Sarvam AI Text-to-Speech (/api/agent/tts) with window.speechSynthesis local fallback
 * - Autonomous Agent Action execution (/api/agent/autonomous-action)
 * - Dynamic Sarvam Key Pool status & management (/api/agent/keys/status, /api/agent/keys/add)
 */

export interface SarvamKeyStatus {
  total_keys: number;
  active_key_index: number;
  has_keys: boolean;
  masked_active_key?: string | null;
}

export interface STTResponse {
  transcript: string;
  language_code: string;
  provider: string;
  fallback_used?: boolean;
  error?: string;
}

export interface TTSResponse {
  audio_base64: string | null;
  language_code: string;
  provider: string;
  fallback_used?: boolean;
  error?: string;
}

export interface AutonomousActionResponse {
  action_executed: string;
  extracted_form?: any;
  created_case?: any;
  updated_case?: any;
  spoken_reply: string;
  spoken_reply_kn?: string;
  spoken_reply_en?: string;
  audio_base64?: string | null;
  agent_steps: string[];
  clinical_note?: string;
  recommendation?: string;
  draft_rx?: any[];
}

let activeMediaRecorder: MediaRecorder | null = null;
let activeAudioStream: MediaStream | null = null;
let recordedChunks: Blob[] = [];
let currentAudioElement: HTMLAudioElement | null = null;

/**
 * Starts recording audio from the user microphone.
 */
export async function startAudioRecording(): Promise<void> {
  recordedChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  activeAudioStream = stream;

  // Prefer audio/webm, fallback to audio/mp4 or default
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
    ? 'audio/webm'
    : '';

  const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
  activeMediaRecorder = new MediaRecorder(stream, options);

  activeMediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  activeMediaRecorder.start(250); // Slice chunks every 250ms
}

/**
 * Stops recording audio and returns the captured audio Blob.
 */
export async function stopAudioRecording(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!activeMediaRecorder) {
      return reject(new Error('MediaRecorder not initialized'));
    }

    activeMediaRecorder.onstop = () => {
      const audioBlob = new Blob(recordedChunks, {
        type: activeMediaRecorder?.mimeType || 'audio/webm',
      });

      // Stop all microphone tracks to release the hardware indicator
      if (activeAudioStream) {
        activeAudioStream.getTracks().forEach((track) => track.stop());
        activeAudioStream = null;
      }
      activeMediaRecorder = null;
      resolve(audioBlob);
    };

    activeMediaRecorder.stop();
  });
}

/**
 * Transcribes an audio blob using Sarvam STT (/api/agent/stt)
 * with graceful fallback to browser speech recognition if requested.
 */
export async function transcribeAudio(
  apiBaseUrl: string,
  audioBlob: Blob,
  languageCode: 'kn-IN' | 'en-IN' = 'kn-IN'
): Promise<STTResponse> {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'patient_voice.webm');
    formData.append('language_code', languageCode);

    const res = await fetch(`${apiBaseUrl}/api/agent/stt`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data: STTResponse = await res.json();
      if (data.transcript && data.transcript.trim()) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Sarvam backend STT error, will check browser fallback:', err);
  }

  return {
    transcript: '',
    language_code: languageCode,
    provider: 'browser_fallback',
    error: 'Using local browser speech recognition fallback',
  };
}

/**
 * Runs client-side browser Web Speech Recognition for instant zero-latency recognition.
 */
export function runBrowserSpeechRecognition(
  languageCode: 'kn-IN' | 'en-IN' = 'kn-IN',
  timeoutMs: number = 7000
): Promise<string> {
  return new Promise((resolve) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      resolve('');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = languageCode;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      const timer = setTimeout(() => {
        try {
          recognition.stop();
        } catch (_) {}
        resolve('');
      }, timeoutMs);

      recognition.onresult = (event: any) => {
        clearTimeout(timer);
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        resolve(transcript.trim());
      };

      recognition.onerror = () => {
        clearTimeout(timer);
        resolve('');
      };

      recognition.onend = () => {
        clearTimeout(timer);
      };

      recognition.start();
    } catch (_) {
      resolve('');
    }
  });
}

/**
 * Speaks text using Sarvam Bulbul TTS (high-fidelity audio/wav),
 * falling back to HTML5 window.speechSynthesis if needed.
 */
export async function speakText(
  apiBaseUrl: string,
  text: string,
  languageCode: 'kn-IN' | 'en-IN' = 'kn-IN',
  existingAudioBase64?: string | null
): Promise<void> {
  // Stop any currently playing audio
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // 1. If base64 audio already available from backend response, play immediately
  if (existingAudioBase64) {
    try {
      const audioUrl = `data:audio/wav;base64,${existingAudioBase64}`;
      const audio = new Audio(audioUrl);
      currentAudioElement = audio;
      await audio.play();
      return;
    } catch (err) {
      console.warn('Failed to play base64 audio directly, falling back:', err);
    }
  }

  // 2. Otherwise, request Sarvam TTS from backend
  try {
    const res = await fetch(`${apiBaseUrl}/api/agent/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        speaker: 'shubh',
      }),
    });

    if (res.ok) {
      const data: TTSResponse = await res.json();
      if (data.audio_base64) {
        const audioUrl = `data:audio/wav;base64,${data.audio_base64}`;
        const audio = new Audio(audioUrl);
        currentAudioElement = audio;
        await audio.play();
        return;
      }
    }
  } catch (err) {
    console.warn('Sarvam backend TTS error, using browser speech synthesis:', err);
  }

  // 3. Browser window.speechSynthesis fallback
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageCode;
    utterance.rate = 0.95;

    // Pick suitable voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find((v) => v.lang.startsWith(languageCode.slice(0, 2)));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Executes end-to-end Autonomous Clinical Agent Action (Triage or Consult)
 */
export async function executeAutonomousAction(
  apiBaseUrl: string,
  utterance: string,
  languageCode: 'kn-IN' | 'en-IN' = 'kn-IN',
  mode: 'triage' | 'consult' = 'triage',
  currentCaseId?: string
): Promise<AutonomousActionResponse> {
  const res = await fetch(`${apiBaseUrl}/api/agent/autonomous-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance,
      language_code: languageCode,
      mode,
      current_case_id: currentCaseId || null,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Agent action failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Fetches current Sarvam API key rotator status.
 */
export async function fetchSarvamKeyStatus(apiBaseUrl: string): Promise<SarvamKeyStatus> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/agent/keys/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch Sarvam key status:', err);
  }
  return {
    total_keys: 0,
    active_key_index: 0,
    has_keys: false,
    masked_active_key: null,
  };
}

/**
 * Dynamically registers keys into the backend Sarvam rotator pool.
 */
export async function addSarvamKeys(
  apiBaseUrl: string,
  keys: string | string[]
): Promise<{ status: string; message: string; key_pool: SarvamKeyStatus }> {
  const res = await fetch(`${apiBaseUrl}/api/agent/keys/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  });

  if (!res.ok) {
    throw new Error(`Failed to add keys: ${await res.text()}`);
  }

  return await res.json();
}
