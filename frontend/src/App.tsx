import { useState, useEffect } from 'react';
import {
  Stethoscope,
  Activity,
  Layers,
  BarChart3,
  Languages,
  ArrowRightLeft,
  Navigation,
  Bot,
  Key,
} from 'lucide-react';
import { SpokeTriageView } from './components/SpokeTriageView';
import { HubQueueView } from './components/HubQueueView';
import { ConsultRoom, type CaseData } from './components/ConsultRoom';
import { BenchmarksView } from './components/BenchmarksView';
import { TalukaUmapView } from './components/TalukaUmapView';
import { AutonomousAgentModal } from './components/AutonomousAgentModal';
import {
  fetchSarvamKeyStatus,
  resolveApiBaseUrl,
  resolveWsBaseUrl,
  sanitizeApiUrl,
  type SarvamKeyStatus,
} from './utils/voiceService';
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

type ViewMode = 'spoke' | 'umap' | 'consult' | 'hub' | 'benchmarks';

export function App() {
  const [activeView, setActiveView] = useState<ViewMode>('spoke');
  const [activeRole, setActiveRole] = useState<'spoke' | 'hub'>('spoke');
  const [lang, setLang] = useState<Language>('en');
  const [activeCase, setActiveCase] = useState<CaseData>(DEFAULT_DEMO_CASE);
  const [umapError, setUmapError] = useState<string | null>(null);

  // Global Autonomous Agent Modal State
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<SarvamKeyStatus>({
    total_keys: 0,
    active_key_index: 0,
    has_keys: false,
    masked_active_key: null,
  });

  // Resolve base API URL (smart cloud detection: routes to https://telethread-api.onrender.com when deployed)
  const apiBaseUrl = sanitizeApiUrl(resolveApiBaseUrl());
  const wsBaseUrl = resolveWsBaseUrl(apiBaseUrl);

  // Load key pool status on mount with retry (handles Render free-tier cold starts)
  useEffect(() => {
    let active = true;
    let attempt = 0;

    const check = async () => {
      try {
        const st = await fetchSarvamKeyStatus(apiBaseUrl);
        if (active) setKeyStatus(st);
      } catch (_) {
        if (active && attempt < 4) {
          attempt++;
          setTimeout(check, 3000);
        }
      }
    };

    check();
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

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

  // Triggered when Taluka uMap clicks "Simulate Call from This PHC"
  const handleSimulateCallFromUmap = async (caseId?: string): Promise<boolean> => {
    if (!caseId || typeof caseId !== 'string' || !caseId.trim()) {
      const err = 'Cannot start consultation: missing or invalid case ID from map selection.';
      console.error(`[TeleThread] ${err}`);
      setUmapError(err);
      return false;
    }

    const targetId = caseId.trim();
    setUmapError(null);

    try {
      // 1. Resolve case from backend API
      const res = await fetch(`${apiBaseUrl}/api/cases/${encodeURIComponent(targetId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Case '${targetId}' was not found on server.`);
        }
        throw new Error(`Failed to retrieve case (HTTP ${res.status}).`);
      }
      const resolved = await res.json();
      if (!resolved || !resolved.id) {
        throw new Error(`Invalid case data received for '${targetId}'.`);
      }

      // 2. Update activeCase with resolved case before switching view
      setActiveCase({
        ...DEFAULT_DEMO_CASE,
        ...resolved,
        timeline: resolved.timeline || DEFAULT_DEMO_CASE.timeline,
        vitals: resolved.vitals || DEFAULT_DEMO_CASE.vitals,
      });
      setActiveRole('spoke');
      setActiveView('consult');
      return true;
    } catch (apiErr: any) {
      console.warn(`[TeleThread] API resolution failed for '${targetId}': ${apiErr.message}. Checking local session fallback...`);

      // Fallback: check session storage if backend is offline
      let fallbackResolved: CaseData | null = null;
      try {
        const localStr = sessionStorage.getItem('telethread_latest_case');
        if (localStr) {
          const parsed = JSON.parse(localStr);
          if (parsed && parsed.id === targetId) {
            fallbackResolved = parsed;
          }
        }
      } catch {}

      if (!fallbackResolved && targetId === DEFAULT_DEMO_CASE.id) {
        fallbackResolved = DEFAULT_DEMO_CASE;
      }

      if (fallbackResolved) {
        setActiveCase({
          ...DEFAULT_DEMO_CASE,
          ...fallbackResolved,
          timeline: fallbackResolved.timeline || DEFAULT_DEMO_CASE.timeline,
          vitals: fallbackResolved.vitals || DEFAULT_DEMO_CASE.vitals,
        });
        setActiveRole('spoke');
        setActiveView('consult');
        return true;
      }

      const explicitError = `Unable to simulate call: ${apiErr.message}`;
      setUmapError(explicitError);
      return false;
    }
  };

  // Triggered when Autonomous Voice Agent creates a case
  const handleCaseCreatedByAgent = (createdCase: any) => {
    setActiveCase({
      ...DEFAULT_DEMO_CASE,
      ...createdCase,
      timeline: createdCase.timeline || DEFAULT_DEMO_CASE.timeline,
      vitals: createdCase.vitals || DEFAULT_DEMO_CASE.vitals,
    });
    setActiveRole('spoke');
    setActiveView('consult');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        height: activeView === 'consult' ? '100vh' : 'auto',
        maxHeight: activeView === 'consult' ? '100vh' : 'none',
        overflow: activeView === 'consult' ? 'hidden' : 'visible',
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
                DevHost 2026
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              One consult, four network tiers, zero restarts
            </div>
          </div>
        </div>

        {/* 5 Crisp Judge-Friendly Navigation Pills */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#0f172a',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            gap: '4px',
            flexWrap: 'wrap',
          }}
        >
          {/* Tab 1: Spoke PHC */}
          <button
            type="button"
            onClick={() => setActiveView('spoke')}
            style={{
              padding: '6px 12px',
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
            <span>1. Spoke PHC (Voice & Triage)</span>
          </button>

          {/* Tab 2: Coastal & Hill uMap */}
          <button
            type="button"
            onClick={() => setActiveView('umap')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: activeView === 'umap' ? 700 : 500,
              backgroundColor: activeView === 'umap' ? '#2563eb' : 'transparent',
              color: activeView === 'umap' ? '#ffffff' : '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Navigation size={14} />
            <span>2. Coastal & Hill uMap</span>
          </button>

          {/* Tab 3: Live Adaptive Consult */}
          <button
            type="button"
            onClick={() => setActiveView('consult')}
            style={{
              padding: '6px 12px',
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
            <span>3. Live Consult (Tier 1–4)</span>
          </button>

          {/* Tab 4: Specialist Hub */}
          <button
            type="button"
            onClick={() => setActiveView('hub')}
            style={{
              padding: '6px 12px',
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
            <span>4. Specialist Hub</span>
          </button>

          {/* Tab 5: Measured Benchmarks */}
          <button
            type="button"
            onClick={() => setActiveView('benchmarks')}
            style={{
              padding: '6px 12px',
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
            <span>5. Measured Benchmarks</span>
          </button>
        </nav>

        {/* Right Actions: AI Agent Bar, Sarvam Key Status, Role & Lang */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Autonomous Voice AI Launcher */}
          <button
            type="button"
            onClick={() => setIsAgentModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1e3a8a, #0369a1)',
              color: '#ffffff',
              border: '1px solid #38bdf8',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
            }}
            title="Launch Voice AI Agent for Zero-Touch Triage or Consultation Co-Pilot"
          >
            <Bot size={15} color="#38bdf8" />
            <span>🤖 AI Voice Agent</span>
          </button>

          {/* Sarvam AI Keys Status Badge */}
          <button
            type="button"
            onClick={() => setIsAgentModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: keyStatus.has_keys ? '#064e3b' : '#334155',
              color: keyStatus.has_keys ? '#6ee7b7' : '#cbd5e1',
              border: `1px solid ${keyStatus.has_keys ? '#059669' : '#475569'}`,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
            }}
            title="View or add Sarvam API keys to fallback rotator"
          >
            <Key size={13} color={keyStatus.has_keys ? '#34d399' : '#94a3b8'} />
            <span>
              {keyStatus.has_keys ? `Sarvam: ${keyStatus.total_keys} Active` : 'Sarvam Keys'}
            </span>
          </button>

          {/* Role Toggle (in Consult) */}
          {activeView === 'consult' && (
            <button
              type="button"
              onClick={() => setActiveRole(activeRole === 'spoke' ? 'hub' : 'spoke')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: activeRole === 'spoke' ? '#1e1b4b' : '#142d42',
                color: activeRole === 'spoke' ? '#a5b4fc' : '#7dd3fc',
                border: `1px solid ${activeRole === 'spoke' ? '#4338ca' : '#0369a1'}`,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title="Toggle preview role between Spoke PHC and Hub Specialist"
            >
              <ArrowRightLeft size={13} />
              <span>{activeRole === 'spoke' ? 'Role: Spoke' : 'Role: Hub'}</span>
            </button>
          )}

          {/* Language Toggle */}
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'kn' : 'en')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
            title="Toggle English / Kannada Interface"
          >
            <Languages size={13} color="#38bdf8" />
            <span>{lang === 'en' ? 'ಕನ್ನಡ' : 'EN'}</span>
          </button>
        </div>
      </header>

      {/* Explicit Recoverable Error Banner for uMap case binding */}
      {umapError && (
        <div
          role="alert"
          style={{
            backgroundColor: '#450a0a',
            borderBottom: '1px solid #dc2626',
            color: '#fecaca',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: 600,
            zIndex: 150,
          }}
        >
          <span>⚠️ {umapError}</span>
          <button
            type="button"
            onClick={() => setUmapError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              padding: '2px 8px',
            }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* 2. Active Screen Content */}
      <main
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: activeView === 'consult' ? 'hidden' : 'visible',
        }}
      >
        {activeView === 'spoke' && (
          <SpokeTriageView
            apiBaseUrl={apiBaseUrl}
            lang={lang}
            onStartConsult={handleStartConsultFromSpoke}
            onOpenAgentModal={() => setIsAgentModalOpen(true)}
            onOpenUmap={() => setActiveView('umap')}
          />
        )}

        {activeView === 'umap' && (
          <TalukaUmapView
            lang={lang}
            onSimulateCall={handleSimulateCallFromUmap}
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

        {activeView === 'hub' && (
          <HubQueueView
            apiBaseUrl={apiBaseUrl}
            lang={lang}
            onJoinConsult={handleJoinConsultFromHub}
          />
        )}

        {activeView === 'benchmarks' && <BenchmarksView lang={lang} />}
      </main>

      {/* 3. Global Autonomous AI Voice Agent Modal */}
      <AutonomousAgentModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        apiBaseUrl={apiBaseUrl}
        lang={lang}
        currentCaseId={activeCase.id}
        onCaseCreated={handleCaseCreatedByAgent}
      />
    </div>
  );
}

export default App;
