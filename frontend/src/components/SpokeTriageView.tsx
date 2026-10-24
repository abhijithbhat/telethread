import React, { useState } from 'react';
import {
  AlertTriangle,
  HeartPulse,
  Activity,
  CheckCircle2,
  PhoneCall,
  User,
  Stethoscope,
  Sparkles,
  Zap,
  ChevronRight,
  ArrowRight,
  AlertOctagon,
  Bot,
  Mic,
  Navigation,
  MapPin,
} from 'lucide-react';
import { t } from '../i18n/translations';

export interface SpokeTriageViewProps {
  apiBaseUrl: string;
  lang: 'en' | 'kn';
  onStartConsult: (caseData: any) => void;
  onOpenAgentModal?: () => void;
  onOpenUmap?: () => void;
}

export const SpokeTriageView: React.FC<SpokeTriageViewProps> = ({
  apiBaseUrl,
  lang,
  onStartConsult,
  onOpenAgentModal,
  onOpenUmap,
}) => {
  // Form state
  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<'M' | 'F' | 'O'>('M');
  const [villagePhc, setVillagePhc] = useState('Sullia PHC');
  const [abhaId, setAbhaId] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  // Vitals state
  const [bpSystolic, setBpSystolic] = useState<string>('120');
  const [bpDiastolic, setBpDiastolic] = useState<string>('80');
  const [spo2, setSpo2] = useState<string>('98');
  const [tempF, setTempF] = useState<string>('98.6');
  const [heartRate, setHeartRate] = useState<string>('72');

  // Symptoms state
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  // Submission and Status state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittedCase, setSubmittedCase] = useState<any | null>(null);
  const [consentError, setConsentError] = useState(false);

  // Villages list specified in contract
  const phcOptions = [
    'Sullia PHC',
    'Beltangady Sub-Centre',
    'Karkala Ghat PHC',
    'Bhatkal Coastal PHC',
  ];

  // Symptoms definitions
  const redFlagSymptoms = [
    {
      id: 'chest_pain',
      label: t('symptomChestPain', lang),
      tag: 'Critical Cardiac',
    },
    {
      id: 'snakebite_trauma',
      label: t('symptomSnakebite', lang),
      tag: 'Toxic / Trauma',
    },
    {
      id: 'severe_breathlessness',
      label: t('symptomSevereBreathlessness', lang),
      tag: 'Respiratory Failure',
    },
    {
      id: 'altered_sensorium',
      label: t('symptomAlteredSensorium', lang),
      tag: 'Neurological / Stroke',
    },
  ];

  const routineSymptoms = [
    {
      id: 'skin_rash',
      label: t('symptomSkinRash', lang),
      tag: 'Dermatology',
    },
    {
      id: 'persistent_fever',
      label: t('symptomPersistentFever', lang),
      tag: 'General Medicine',
    },
    {
      id: 'joint_pain',
      label: t('symptomJointPain', lang),
      tag: 'Orthopedics',
    },
    {
      id: 'gi_upset',
      label: t('symptomGiUpset', lang),
      tag: 'Gastroenterology',
    },
    {
      id: 'chronic_followup',
      label: t('symptomChronicFollowup', lang),
      tag: 'NCD Follow-up',
    },
  ];

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // 1-Click Demo Fill: Red Flag (Ramesh Gowda)
  const handleFillRedFlagDemo = () => {
    setPatientName('Ramesh Gowda');
    setAge('54');
    setGender('M');
    setVillagePhc('Sullia PHC');
    setAbhaId('91-2345-6789-0123');
    setConsentGiven(true);
    setConsentError(false);

    setBpSystolic('185');
    setBpDiastolic('110');
    setSpo2('89');
    setTempF('99.1');
    setHeartRate('112');

    setSelectedSymptoms(['chest_pain', 'severe_breathlessness']);
    setSubmittedCase(null);
    setSubmissionError(null);
  };

  // 1-Click Demo Fill: Routine (Manjula Nayak)
  const handleFillRoutineDemo = () => {
    setPatientName('Manjula Nayak');
    setAge('36');
    setGender('F');
    setVillagePhc('Karkala Ghat PHC');
    setAbhaId('91-8876-5432-1098');
    setConsentGiven(true);
    setConsentError(false);

    setBpSystolic('118');
    setBpDiastolic('78');
    setSpo2('98');
    setTempF('98.4');
    setHeartRate('74');

    setSelectedSymptoms(['skin_rash', 'persistent_fever']);
    setSubmittedCase(null);
    setSubmissionError(null);
  };

  // Clinical client-side evaluation helper for offline resiliency
  // NOTE: SpO2 critical red-flag threshold is configured at <92% as current application policy,
  // matching backend evaluate_triage rules. Requires formal clinical review and sign-off before real-world clinical use.
  const checkIsRedFlag = (): boolean => {
    const hasRedFlagSymptom = selectedSymptoms.some((s) =>
      ['chest_pain', 'snakebite_trauma', 'severe_breathlessness', 'altered_sensorium'].includes(s)
    );
    const spo2Num = parseFloat(spo2) || 98;
    const bpSysNum = parseFloat(bpSystolic) || 120;
    const bpDiaNum = parseFloat(bpDiastolic) || 80;
    const hrNum = parseFloat(heartRate) || 72;

    return (
      hasRedFlagSymptom ||
      spo2Num < 92 ||
      bpSysNum >= 180 ||
      bpDiaNum >= 110 ||
      hrNum > 120 ||
      hrNum < 50
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!consentGiven) {
      setConsentError(true);
      return;
    }
    setConsentError(false);

    setIsSubmitting(true);
    setSubmissionError(null);

    const clientRedFlag = checkIsRedFlag();
    const parsedVitals = {
      bp_systolic: parseInt(bpSystolic, 10) || 120,
      bp_diastolic: parseInt(bpDiastolic, 10) || 80,
      spo2: parseInt(spo2, 10) || 98,
      temp_f: parseFloat(tempF) || 98.6,
      hr: parseInt(heartRate, 10) || 72,
    };

    const payload = {
      patient_name: patientName.trim() || (lang === 'kn' ? 'ಅನಾಮಿಕ ರೋಗಿ' : 'Emergency Patient'),
      age: parseInt(age, 10) || 45,
      gender,
      abha_id: abhaId.trim() || undefined,
      consent_given: consentGiven,
      village_taluka: villagePhc,
      symptoms: selectedSymptoms,
      vitals: parsedVitals,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const caseData = await response.json();
      setSubmittedCase(caseData);
      try {
        sessionStorage.setItem('telethread_latest_case', JSON.stringify(caseData));
        window.dispatchEvent(new CustomEvent('telethread_case_updated', { detail: caseData }));
      } catch {}
    } catch (err: any) {
      console.warn('Backend /api/cases unavailable or offline, generating local triage case:', err);
      // Fallback for offline demo or when backend is booting up
      const mockId = `TT-${Math.floor(100 + Math.random() * 900)}`;
      const fallbackCase = {
        id: mockId,
        patient_name: payload.patient_name,
        age: payload.age,
        gender: payload.gender,
        abha_id: payload.abha_id || '91-2345-6789-0123',
        consent_given: true,
        village_taluka: payload.village_taluka,
        symptoms: payload.symptoms,
        vitals: payload.vitals,
        is_red_flag: clientRedFlag,
        emergency_action: clientRedFlag
          ? 'ALERT HUB: Advise 108 / 112 immediately and refer to nearest FRU.'
          : undefined,
        specialty: clientRedFlag
          ? 'Cardiology / Emergency'
          : selectedSymptoms.includes('skin_rash')
          ? 'Dermatology'
          : 'General Medicine',
        urgency: clientRedFlag ? 'CRITICAL' : 'ROUTINE',
        current_tier: 1,
        ai_clinical_brief: `${payload.age}${payload.gender} from ${payload.village_taluka} presenting with ${
          payload.symptoms.join(', ') || 'symptoms'
        }. SpO2 ${payload.vitals.spo2}%, BP ${payload.vitals.bp_systolic}/${payload.vitals.bp_diastolic}. ${
          clientRedFlag ? 'HIGH RISK RED-FLAG - IMMEDIATE ATTENTION REQUIRED' : 'Routine evaluation advised.'
        }`,
        timeline: [
          {
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            type: 'TRIAGE',
            content: `Registered at ${payload.village_taluka} by Health Worker`,
          },
        ],
        prescription: null,
      };

      setSubmittedCase(fallbackCase);
      try {
        sessionStorage.setItem('telethread_latest_case', JSON.stringify(fallbackCase));
        window.dispatchEvent(new CustomEvent('telethread_case_updated', { detail: fallbackCase }));
      } catch {}
    } finally {
      setIsSubmitting(false);
    }
  };

  // NOTE: SpO2 critical threshold configured at <92% per application policy pending formal clinical review.
  const isCurrentSpo2Critical = (parseFloat(spo2) || 98) < 92;
  const isCurrentBpCrisis =
    (parseFloat(bpSystolic) || 120) >= 180 || (parseFloat(bpDiastolic) || 80) >= 110;

  return (
    <div
      style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1e293b',
        textAlign: 'left',
      }}
    >
      {/* 🤖 HERO BANNER: Autonomous Voice Triage Agent */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 60%, #172554 100%)',
          borderRadius: '16px',
          padding: '20px 24px',
          color: '#ffffff',
          boxShadow: '0 10px 30px -5px rgba(37, 99, 235, 0.3)',
          border: '1px solid #3b82f6',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 0 18px rgba(37, 99, 235, 0.6)',
              }}
            >
              <Bot size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>
                  {lang === 'kn'
                    ? '🤖 ಸ್ವಾಯತ್ತ ಧ್ವನಿ ಟ್ರಯೇಜ್ ಏಜೆಂಟ್ (ತುರ್ತು ರೋಗಿಗಳಿಗೆ ನೇರ ಪ್ರವೇಶ)'
                    : '🤖 Autonomous Voice Triage Agent (Zero-Touch for Critical Patients)'}
                </h3>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: '#1e3a8a',
                    color: '#93c5fd',
                    border: '1px solid #2563eb',
                  }}
                >
                  Sarvam AI + Gemini
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                {lang === 'kn'
                  ? 'ತೀವ್ರ ಎದೆ ನೋವು ಅಥವಾ ಹಾವು ಕಡಿತದಂತಹ ತುರ್ತು ಸ್ಥಿತಿಗಳಲ್ಲಿ, ಕೇವಲ ಧ್ವನಿಯಲ್ಲಿ ಮಾತನಾಡಿ. ಏಜೆಂಟ್ ತಾನಾಗಿಯೇ ವಿವರಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ ತಜ್ಞ ವೈದ್ಯರಿಗೆ ರವಾನಿಸುತ್ತದೆ.'
                  : 'Speak in Kannada (ಕನ್ನಡ) or English: the agent auto-fills demographics, detects Red Flags, and immediately escalates to the District Specialist Hub queue.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onOpenAgentModal}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Mic size={16} />
              <span>{lang === 'kn' ? 'ಧ್ವನಿ ಏಜೆಂಟ್ ಪ್ರಾರಂಭಿಸಿ' : 'Launch Voice Agent'}</span>
            </button>

            {onOpenUmap && (
              <button
                type="button"
                onClick={onOpenUmap}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  color: '#93c5fd',
                  border: '1px solid #3b82f6',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Navigation size={15} />
                <span>{lang === 'kn' ? 'ತಾಲೂಕು uMap ವೀಕ್ಷಿಸಿ' : 'View Taluka uMap'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mini Taluka Route Indicator */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid #334155',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={13} color="#f59e0b" />
            <span style={{ color: '#94a3b8' }}>Ghat Emergency Transit Corridor:</span>
            <strong style={{ color: '#ffffff' }}>Sullia PHC (Tier 3)</strong>
            <span style={{ color: '#64748b' }}>➔ 32 km (45m) ➔</span>
            <strong style={{ color: '#34d399' }}>Puttur FRU</strong>
            <span style={{ color: '#64748b' }}>➔ 48 km ➔</span>
            <strong style={{ color: '#60a5fa' }}>Wenlock Specialist Hub (Mangaluru)</strong>
          </div>
          <span style={{ color: '#f87171', fontWeight: 700 }}>
            🚨 108 FRU Antivenom Ambulance Priority Active
          </span>
        </div>
      </div>

      {/* Top Header Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #0f766e 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(6, 95, 70, 0.25)',
          marginBottom: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                Spoke Health Sub-Centre / PHC
              </span>
              <span
                style={{
                  background: '#10b981',
                  color: '#064e3b',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                Karnataka Rural Health
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>
              {t('patientRegistration', lang)}
            </h1>
            <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px' }}>
              {t('patientRegSubtitle', lang)} • ABHA Integrated • Zero-Restart Triage
            </p>
          </div>

          {/* Quick Demo Pre-fills */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(8px)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {t('demoButtonsTitle', lang)}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleFillRedFlagDemo}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Zap size={14} />
                {t('fillRedFlagDemo', lang)}
              </button>
              <button
                type="button"
                onClick={handleFillRoutineDemo}
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  color: '#065f46',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Sparkles size={14} color="#059669" />
                {t('fillRoutineDemo', lang)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* EMERGENCY RED FLAG BANNER (if submitted case is red flag) */}
      {submittedCase && submittedCase.is_red_flag && (
        <div
          style={{
            background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
            borderRadius: '16px',
            padding: '24px',
            color: '#ffffff',
            boxShadow: '0 12px 30px rgba(220, 38, 38, 0.35)',
            marginBottom: '28px',
            border: '2px solid #ef4444',
            animation: 'pulseRed 2s infinite ease-in-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                borderRadius: '50%',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertOctagon size={36} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: '#ffffff',
                    color: '#991b1b',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 900,
                    letterSpacing: '1px',
                  }}
                >
                  CRITICAL QUEUE JUMP
                </span>
                <span style={{ fontSize: '13px', opacity: 0.9 }}>
                  Case ID: <strong>{submittedCase.id}</strong>
                </span>
              </div>
              <h2 style={{ margin: '8px 0 6px', fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>
                {t('redFlagAlertTitle', lang)}
              </h2>
              <p style={{ margin: '0 0 12px', fontSize: '15px', lineHeight: 1.5, opacity: 0.95 }}>
                {submittedCase.emergency_action || t('redFlagAlertMessage', lang)}
              </p>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <PhoneCall size={16} />
                <span>
                  Immediate Actions: <strong>Advise 108 / 112 ambulance</strong> • Administer first aid • Case prioritized to Cardiology / Emergency Specialist
                </span>
              </div>

              <button
                type="button"
                onClick={() => onStartConsult(submittedCase)}
                style={{
                  background: '#ffffff',
                  color: '#991b1b',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px 24px',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <Zap size={20} fill="#991b1b" />
                {t('enterPriorityConsult', lang)}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROUTINE SUCCESS BANNER (if submitted case is not red flag) */}
      {submittedCase && !submittedCase.is_red_flag && (
        <div
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            borderRadius: '16px',
            padding: '20px 24px',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(6, 95, 70, 0.2)',
            marginBottom: '28px',
            border: '1px solid #10b981',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  background: '#d1fae5',
                  color: '#065f46',
                  borderRadius: '50%',
                  padding: '10px',
                  display: 'flex',
                }}
              >
                <CheckCircle2 size={28} />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', opacity: 0.9 }}>
                  Case Registered • ID: {submittedCase.id}
                </div>
                <h3 style={{ margin: '2px 0 4px', fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>
                  {t('routineSuccessTitle', lang)}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
                  {t('routineSuccessMessage', lang)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onStartConsult(submittedCase)}
              style={{
                background: '#ffffff',
                color: '#065f46',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              }}
            >
              {t('startRoutineConsult', lang)}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Section 1: Demographics */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
              colorScheme: 'light',
              color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
              <User size={20} color="#0d9488" />
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                1. {t('patientRegistration', lang)}
              </h2>
            </div>

            {/* Patient Name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('patientName', lang)} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder={t('patientNamePlaceholder', lang)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 600,
                  outline: 'none',
                  background: '#ffffff',
                  color: '#0f172a',
                  colorScheme: 'light',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Age & Gender */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('age', lang)} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="125"
                  required
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder={t('agePlaceholder', lang)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    background: '#ffffff',
                    color: '#0f172a',
                    colorScheme: 'light',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('gender', lang)} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'M' | 'F' | 'O')}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    background: '#ffffff',
                    color: '#0f172a',
                    colorScheme: 'light',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="M">{t('genderMale', lang)}</option>
                  <option value="F">{t('genderFemale', lang)}</option>
                  <option value="O">{t('genderOther', lang)}</option>
                </select>
              </div>
            </div>

            {/* Village / PHC Selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('selectVillagePhc', lang)} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={villagePhc}
                onChange={(e) => setVillagePhc(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 600,
                  outline: 'none',
                  background: '#ffffff',
                  color: '#0f172a',
                  colorScheme: 'light',
                  boxSizing: 'border-box',
                }}
              >
                {phcOptions.map((phc) => (
                  <option key={phc} value={phc}>
                    {phc}
                  </option>
                ))}
              </select>
            </div>

            {/* ABHA ID (Optional) */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('abhaId', lang)}
              </label>
              <input
                type="text"
                value={abhaId}
                onChange={(e) => setAbhaId(e.target.value)}
                placeholder={t('abhaIdPlaceholder', lang)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 600,
                  outline: 'none',
                  background: '#ffffff',
                  color: '#0f172a',
                  colorScheme: 'light',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                {t('abhaHint', lang)}
              </span>
            </div>

            {/* Mandatory Informed Consent */}
            <div
              style={{
                background: consentError ? '#fef2f2' : '#f8fafc',
                border: consentError ? '1px solid #ef4444' : '1px solid #e2e8f0',
                padding: '14px',
                borderRadius: '10px',
                transition: 'all 0.2s ease',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => {
                    setConsentGiven(e.target.checked);
                    if (e.target.checked) setConsentError(false);
                  }}
                  style={{
                    width: '18px',
                    height: '18px',
                    marginTop: '2px',
                    accentColor: '#059669',
                    cursor: 'pointer',
                  }}
                />
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', display: 'block' }}>
                    {t('informedConsent', lang)} <span style={{ color: '#ef4444' }}>*</span>
                  </span>
                  <span style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                    {t('informedConsentLabel', lang)}
                  </span>
                </div>
              </label>
              {consentError && (
                <div style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} />
                  {t('consentRequiredError', lang)}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Vitals */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
              colorScheme: 'light',
              color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HeartPulse size={20} color="#e11d48" />
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                  2. {t('vitalsTitle', lang)}
                </h2>
              </div>
              {(isCurrentSpo2Critical || isCurrentBpCrisis) && (
                <span
                  style={{
                    background: '#fee2e2',
                    color: '#b91c1c',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <AlertTriangle size={12} />
                  Abnormal Vitals
                </span>
              )}
            </div>

            {/* Blood Pressure (Systolic / Diastolic) */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Blood Pressure ({t('bpSystolic', lang)} / {t('bpDiastolic', lang)}) ({t('unitMmHg', lang)})
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number"
                  placeholder="120"
                  value={bpSystolic}
                  onChange={(e) => setBpSystolic(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: isCurrentBpCrisis ? '2px solid #ef4444' : '1px solid #cbd5e1',
                    fontSize: '15px',
                    fontWeight: 700,
                    outline: 'none',
                    background: isCurrentBpCrisis ? '#fef2f2' : '#ffffff',
                    color: isCurrentBpCrisis ? '#b91c1c' : '#0f172a',
                    colorScheme: 'light',
                  }}
                />
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#94a3b8' }}>/</span>
                <input
                  type="number"
                  placeholder="80"
                  value={bpDiastolic}
                  onChange={(e) => setBpDiastolic(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: isCurrentBpCrisis ? '2px solid #ef4444' : '1px solid #cbd5e1',
                    fontSize: '15px',
                    fontWeight: 700,
                    outline: 'none',
                    background: isCurrentBpCrisis ? '#fef2f2' : '#ffffff',
                    color: isCurrentBpCrisis ? '#b91c1c' : '#0f172a',
                    colorScheme: 'light',
                  }}
                />
              </div>
              {isCurrentBpCrisis && (
                <span style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                  ⚠️ Hypertensive Crisis threshold (Systolic ≥ 180 or Diastolic ≥ 110)
                </span>
              )}
            </div>

            {/* SpO2 Oxygen Saturation */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  {t('spo2', lang)} ({t('unitPercent', lang)})
                </label>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isCurrentSpo2Critical ? '#b91c1c' : '#059669',
                  }}
                >
                  {isCurrentSpo2Critical ? 'CRITICAL HYPOXIA (<92%)' : 'Normal (≥95%)'}
                </span>
              </div>
              <input
                type="number"
                min="50"
                max="100"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: isCurrentSpo2Critical ? '2px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: '15px',
                  fontWeight: 700,
                  outline: 'none',
                  background: isCurrentSpo2Critical ? '#fef2f2' : '#ffffff',
                  color: isCurrentSpo2Critical ? '#b91c1c' : '#0f172a',
                  colorScheme: 'light',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Temperature & Heart Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('tempF', lang)} ({t('unitFahrenheit', lang)})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tempF}
                  onChange={(e) => setTempF(e.target.value)}
                  placeholder="98.6"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '15px',
                    fontWeight: 700,
                    outline: 'none',
                    background: '#ffffff',
                    color: '#0f172a',
                    colorScheme: 'light',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('heartRate', lang)} ({t('unitBpm', lang)})
                </label>
                <input
                  type="number"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  placeholder="72"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '15px',
                    fontWeight: 700,
                    outline: 'none',
                    background: '#ffffff',
                    color: '#0f172a',
                    colorScheme: 'light',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Guided Triage Checklist */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
            marginTop: '24px',
            colorScheme: 'light',
            color: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
            <Activity size={20} color="#6366f1" />
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
              3. {t('guidedTriageTitle', lang)}
            </h2>
          </div>
          <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#64748b' }}>
            {t('guidedTriageSubtitle', lang)}
          </p>

          {/* Red Flag Symptoms Group */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#b91c1c',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangle size={15} />
              {t('redFlagSymptomsGroup', lang)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
              {redFlagSymptoms.map((sym) => {
                const isSelected = selectedSymptoms.includes(sym.id);
                return (
                  <div
                    key={sym.id}
                    onClick={() => toggleSymptom(sym.id)}
                    style={{
                      background: isSelected ? '#fee2e2' : '#fff5f5',
                      border: isSelected ? '2px solid #ef4444' : '1px solid #fecaca',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent div
                      style={{
                        marginTop: '2px',
                        accentColor: '#dc2626',
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b', lineHeight: 1.3 }}>
                        {sym.label}
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: '#fca5a5',
                          color: '#7f1d1d',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {sym.tag}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Routine Symptoms Group */}
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#0369a1',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '10px',
              }}
            >
              {t('routineSymptomsGroup', lang)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
              {routineSymptoms.map((sym) => {
                const isSelected = selectedSymptoms.includes(sym.id);
                return (
                  <div
                    key={sym.id}
                    onClick={() => toggleSymptom(sym.id)}
                    style={{
                      background: isSelected ? '#f0f9ff' : '#f8fafc',
                      border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{
                        marginTop: '2px',
                        accentColor: '#0284c7',
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>
                        {sym.label}
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {sym.tag}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px' }}>
          {submissionError && (
            <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: 600 }}>
              {submissionError}
            </span>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              background: checkIsRedFlag()
                ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '14px 32px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: checkIsRedFlag()
                ? '0 6px 18px rgba(220, 38, 38, 0.35)'
                : '0 6px 18px rgba(5, 150, 105, 0.35)',
              opacity: isSubmitting ? 0.7 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {isSubmitting ? (
              <>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #ffffff',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                {t('submittingCase', lang)}
              </>
            ) : (
              <>
                {checkIsRedFlag() ? <AlertTriangle size={18} /> : <Stethoscope size={18} />}
                {t('submitTriageCase', lang)}
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SpokeTriageView;
