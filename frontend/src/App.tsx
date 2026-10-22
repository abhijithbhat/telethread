import { useState } from 'react';
import {
  Stethoscope,
  Activity,
  Layers,
  BarChart3,
  Languages,
  ArrowRightLeft,
} from 'lucide-react';
import { SpokeTriageView } from './components/SpokeTriageView';
import { HubQueueView } from './components/HubQueueView';
import { ConsultRoom, type CaseData } from './components/ConsultRoom';
import { BenchmarksView } from './components/BenchmarksView';
import type { Language } from './i18n/translations';

// Baseline demo case conforming to SHARED_CONTRACT.md
const DEFAULT_DEMO_CASE: CaseData = {
  id: 'TT-101',
  patient_name: 'Ramesh Gowda',
  age: 54,
  gender: 'M',
  abha_id: '91-2345-6789-0123',
  consent_given: true,
  village_taluka: 'Sullia PHC',
  symptoms: ['chest_pain', 'sweating', 'snakebite_trauma'],
  vitals: {
    bp_systolic: 185,
    bp_diastolic: 110,
    spo2: 89,
    temp_f: 99.1,
    hr: 112,
  },
  is_red_flag: true,
  emergency_action: 'ALERT HUB: Advise 108 / 112 immediately and refer to nearest FRU.',
  specialty: 'Cardiology / Emergency',
  urgency: 'CRITICAL',
  current_tier: 1,
  ai_clinical_brief: '54M from Sullia PHC with acute chest pain & suspected viper bite, SpO2 89%, BP 185/110. Critical red flag requiring immediate ASV.',
  timeline: [
    { timestamp: '10:15:02', type: 'TRIAGE', content: 'Case registered at Spoke' },
    { timestamp: '10:16:10', type: 'PHOTO', url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=320&q=80', tier: 3 },
    { timestamp: '10:17:00', type: 'VOICE_NOTE', transcript: 'Patient reports severe crushing chest pain radiating to left jaw', tier: 4 },
  ],
  prescription: null,
};

type ViewMode = 'spoke' | 'hub' | 'consult' | 'benchmarks';

export function App() {
  const [activeView, setActiveView] = useState<ViewMode>('spoke');
  const [activeRole, setActiveRole] = useState<'spoke' | 'hub'>('spoke');
  const [lang, setLang] = useState<Language>('en');
  const [activeCase, setActiveCase] = useState<CaseData>(DEFAULT_DEMO_CASE);

  // Resolve base API URL (Vite environment variable or default)
  let rawApi = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim();
  if (rawApi && !/^https?:\/\//i.test(rawApi)) {
    rawApi = `https://${rawApi}`;
  }
  const apiBaseUrl = rawApi.replace(/\/+$/, '');
  const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');

  // Triggered when Spoke health worker clicks "Enter Priority Live Consult"
  const handleStartConsultFromSpoke = (caseData: any) => {
    setActiveCase({
      ...DEFAULT_DEMO_CASE,
      ...caseData,
      timeline: caseData.timeline || DEFAULT_DEMO_CASE.timeline,
      vitals: caseData.vitals || DEFAULT_DEMO_CASE.vitals,
    });
    setActiveRole('spoke');
    setActiveView('consult');
  };

  // Triggered when Hub specialist clicks "Join Live Consult"
  const handleJoinConsultFromHub = (caseData: any) => {
    setActiveCase({
      ...DEFAULT_DEMO_CASE,
      ...caseData,
      timeline: caseData.timeline || DEFAULT_DEMO_CASE.timeline,
      vitals: caseData.vitals || DEFAULT_DEMO_CASE.vitals,
    });
    setActiveRole('hub');
    setActiveView('consult');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#070a13',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* 1. Global Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 200,
          backgroundColor: '#0a0f1d',
          borderBottom: '1px solid #1e293b',
          padding: '10px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Logo & Tagline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              color: '#ffffff',
              fontSize: '18px',
              boxShadow: '0 0 14px rgba(37, 99, 235, 0.6)',
            }}
          >
            TT
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                TeleThread
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#1e3a8a',
                  color: '#93c5fd',
                  border: '1px solid #2563eb',
                }}
              >
                Sahyadri DevHost 2026
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              One consult, four network tiers, zero restarts
            </div>
          </div>
        </div>

        {/* View Switcher Pills */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#0f172a',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveView('spoke')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: activeView === 'spoke' ? 700 : 500,
              backgroundColor: activeView === 'spoke' ? '#2563eb' : 'transparent',
              color: activeView === 'spoke' ? '#ffffff' : '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Stethoscope size={14} />
            1. Spoke (PHC Health Worker)
          </button>

          <button
            type="button"
            onClick={() => setActiveView('hub')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: activeView === 'hub' ? 700 : 500,
              backgroundColor: activeView === 'hub' ? '#2563eb' : 'transparent',
              color: activeView === 'hub' ? '#ffffff' : '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Activity size={14} />
            2. Hub (Specialist Doctor)
          </button>

          <button
            type="button"
            onClick={() => setActiveView('consult')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: activeView === 'consult' ? 700 : 500,
              backgroundColor: activeView === 'consult' ? '#0ea5e9' : 'transparent',
              color: activeView === 'consult' ? '#ffffff' : '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={14} />
            3. Live Adaptive Consult
          </button>

          <button
            type="button"
            onClick={() => setActiveView('benchmarks')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: activeView === 'benchmarks' ? 700 : 500,
              backgroundColor: activeView === 'benchmarks' ? '#2563eb' : 'transparent',
              color: activeView === 'benchmarks' ? '#ffffff' : '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <BarChart3 size={14} />
            4. Measured Benchmarks
          </button>
        </nav>

        {/* Right Actions: Role Toggle & Language Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeView === 'consult' && (
            <button
              type="button"
              onClick={() => setActiveRole(activeRole === 'spoke' ? 'hub' : 'spoke')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: activeRole === 'spoke' ? '#1e1b4b' : '#142d42',
                color: activeRole === 'spoke' ? '#a5b4fc' : '#7dd3fc',
                border: `1px solid ${activeRole === 'spoke' ? '#4338ca' : '#0369a1'}`,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
              title="Toggle preview role between Spoke PHC and Hub Specialist"
            >
              <ArrowRightLeft size={14} />
              <span>Role: {activeRole === 'spoke' ? 'Spoke (PHC)' : 'Hub (Specialist)'}</span>
            </button>
          )}

          {/* Language Toggle */}
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'kn' : 'en')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
            title="Toggle English / Kannada Interface"
          >
            <Languages size={14} color="#38bdf8" />
            <span>{lang === 'en' ? 'ಕನ್ನಡ (KN)' : 'English (EN)'}</span>
          </button>
        </div>
      </header>

      {/* 2. Active Screen Content */}
      <main style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
        {activeView === 'spoke' && (
          <SpokeTriageView
            apiBaseUrl={apiBaseUrl}
            lang={lang}
            onStartConsult={handleStartConsultFromSpoke}
          />
        )}

        {activeView === 'hub' && (
          <HubQueueView
            apiBaseUrl={apiBaseUrl}
            lang={lang}
            onJoinConsult={handleJoinConsultFromHub}
          />
        )}

        {activeView === 'consult' && (
          <ConsultRoom
            caseData={activeCase}
            role={activeRole}
            apiBaseUrl={apiBaseUrl}
            wsBaseUrl={wsBaseUrl}
            onLeave={() => setActiveView(activeRole === 'spoke' ? 'spoke' : 'hub')}
            onCaseUpdate={(updated) => setActiveCase(updated)}
          />
        )}

        {activeView === 'benchmarks' && <BenchmarksView lang={lang} />}
      </main>
    </div>
  );
}

export default App;
