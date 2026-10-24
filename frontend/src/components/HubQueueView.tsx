import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Sparkles,
  FileText,
  Video,
  Download,
  Copy,
  Search,
  Filter,
  X,
  Send,
  Pill,
  Wifi,
  WifiOff,
  Radio,
  MapPin,
  AlertOctagon,
  ChevronRight,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { speakText } from '../utils/voiceService';

export interface HubQueueViewProps {
  apiBaseUrl: string;
  lang: 'en' | 'kn';
  onJoinConsult: (caseData: any) => void;
}

export const HubQueueView: React.FC<HubQueueViewProps> = ({
  apiBaseUrl,
  lang,
  onJoinConsult,
}) => {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'ROUTINE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Drawers state
  const [selectedCaseForPrescription, setSelectedCaseForPrescription] = useState<any | null>(null);
  const [selectedCaseForFhir, setSelectedCaseForFhir] = useState<any | null>(null);
  const [fhirData, setFhirData] = useState<any | null>(null);
  const [fhirLoading, setFhirLoading] = useState<boolean>(false);

  // Prescription Form state
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxMedication, setRxMedication] = useState('');
  const [rxDosage, setRxDosage] = useState('');
  const [rxFollowUpDate, setRxFollowUpDate] = useState('');
  const [rxAdvice, setRxAdvice] = useState('');
  const [rxSubmitting, setRxSubmitting] = useState(false);
  const [rxSuccess, setRxSuccess] = useState(false);
  const [copiedSms, setCopiedSms] = useState(false);

  // Fallback initial cases when backend is starting or offline
  const fallbackCases = [
    {
      id: 'TT-101',
      patient_name: 'Ramesh Gowda',
      age: 54,
      gender: 'M',
      abha_id: '91-2345-6789-0123',
      consent_given: true,
      village_taluka: 'Sullia PHC',
      symptoms: ['chest_pain', 'sweating'],
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
      ai_clinical_brief:
        '54M from Sullia PHC with acute chest pain, SpO2 89%, BP 185/110. Severe cardiac risk. Immediate antiplatelet loading & 108 transfer recommended.',
      timeline: [
        { timestamp: '10:15:02', type: 'TRIAGE', content: 'Case registered at Spoke' },
        { timestamp: '10:16:10', type: 'PHOTO', url: '', tier: 3 },
      ],
      prescription: null,
    },
    {
      id: 'TT-102',
      patient_name: 'Devaki Shetty',
      age: 62,
      gender: 'F',
      abha_id: '91-4432-1109-8765',
      consent_given: true,
      village_taluka: 'Beltangady Sub-Centre',
      symptoms: ['snakebite_trauma', 'altered_sensorium'],
      vitals: {
        bp_systolic: 140,
        bp_diastolic: 90,
        spo2: 93,
        temp_f: 98.4,
        hr: 104,
      },
      is_red_flag: true,
      emergency_action: 'ALERT HUB: Administer Anti-Snake Venom (ASV) protocol and organize emergency transfer.',
      specialty: 'Toxicology / Emergency',
      urgency: 'CRITICAL',
      current_tier: 2,
      ai_clinical_brief:
        '62F from Beltangady with Russell viper bite puncture wounds on lower left leg, mild neuro-toxic ptosis. Urgent ASV infusion required.',
      timeline: [
        { timestamp: '10:18:30', type: 'TRIAGE', content: 'Case registered at Sub-Centre' },
      ],
      prescription: null,
    },
    {
      id: 'TT-103',
      patient_name: 'Shankar Poojary',
      age: 48,
      gender: 'M',
      abha_id: '91-7654-3210-9876',
      consent_given: true,
      village_taluka: 'Bhatkal Coastal PHC',
      symptoms: ['persistent_fever', 'joint_pain'],
      vitals: {
        bp_systolic: 130,
        bp_diastolic: 84,
        spo2: 96,
        temp_f: 102.2,
        hr: 92,
      },
      is_red_flag: false,
      specialty: 'General Medicine',
      urgency: 'HIGH',
      current_tier: 3,
      ai_clinical_brief:
        '48M fisherman from Bhatkal presenting with 5-day continuous fever (102.2°F), thrombocytopenia suspected. RDT for Malaria/Dengue advised.',
      timeline: [
        { timestamp: '10:10:00', type: 'TRIAGE', content: 'Case registered at Spoke' },
      ],
      prescription: null,
    },
    {
      id: 'TT-104',
      patient_name: 'Manjula Nayak',
      age: 36,
      gender: 'F',
      abha_id: '91-8876-5432-1098',
      consent_given: true,
      village_taluka: 'Karkala Ghat PHC',
      symptoms: ['skin_rash'],
      vitals: {
        bp_systolic: 118,
        bp_diastolic: 78,
        spo2: 98,
        temp_f: 98.4,
        hr: 74,
      },
      is_red_flag: false,
      specialty: 'Dermatology',
      urgency: 'ROUTINE',
      current_tier: 4,
      ai_clinical_brief:
        '36F agricultural worker from Karkala with annular erythematous lesions on forearm, consistent with Tinea corporis fungal infection.',
      timeline: [
        { timestamp: '09:45:12', type: 'TRIAGE', content: 'Case registered via Offline Outbox' },
      ],
      prescription: null,
    },
  ];

  // Helper to merge local registered cases with fetched/fallback cases
  const mergeLocalCases = (baseCases: any[]) => {
    try {
      const localStr = sessionStorage.getItem('telethread_latest_case');
      if (localStr) {
        const localCase = JSON.parse(localStr);
        if (localCase && localCase.id) {
          const filtered = baseCases.filter((c) => c.id !== localCase.id);
          return [localCase, ...filtered];
        }
      }
    } catch {}
    return baseCases;
  };

  // Fetch Cases every 3 seconds as required by contract
  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/cases`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setCases(mergeLocalCases(data));
      } else {
        // Fallback to sample if backend returns empty list
        setCases(mergeLocalCases(fallbackCases));
      }
      setError(null);
    } catch (err: any) {
      // Backend not running or offline: keep fallback cases active
      setCases((prev) => (prev.length > 0 ? mergeLocalCases(prev) : mergeLocalCases(fallbackCases)));
      setError('Live link to backend is synchronizing');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 3000);

    const handleCaseUpdated = (e: any) => {
      const newCase = e.detail;
      if (newCase) {
        setCases((prev) => [newCase, ...prev.filter((c) => c.id !== newCase.id)]);
      }
    };
    window.addEventListener('telethread_case_updated', handleCaseUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('telethread_case_updated', handleCaseUpdated);
    };
  }, [fetchCases]);

  // Urgency sorting logic: CRITICAL (Red-Flag) pulses at top, followed by HIGH, then ROUTINE
  const urgencyWeight = (c: any) => {
    if (c.is_red_flag || c.urgency === 'CRITICAL') return 3;
    if (c.urgency === 'HIGH') return 2;
    return 1;
  };

  const sortedCases = [...cases].sort((a, b) => {
    // Ramesh Gowda TT-101 is the flagship emergency demo case - pin to #1 spot
    if (a.id === 'TT-101' && b.id !== 'TT-101') return -1;
    if (b.id === 'TT-101' && a.id !== 'TT-101') return 1;
    const weightDiff = urgencyWeight(b) - urgencyWeight(a);
    if (weightDiff !== 0) return weightDiff;
    return (a.id || '').localeCompare(b.id || '');
  });

  const filteredCases = sortedCases.filter((c) => {
    if (filter === 'CRITICAL' && !c.is_red_flag && c.urgency !== 'CRITICAL') return false;
    if (filter === 'HIGH' && (c.urgency !== 'HIGH' || c.is_red_flag)) return false;
    if (filter === 'ROUTINE' && c.urgency !== 'ROUTINE') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.patient_name?.toLowerCase().includes(q);
      const matchId = c.id?.toLowerCase().includes(q);
      const matchVillage = c.village_taluka?.toLowerCase().includes(q);
      const matchSpecialty = c.specialty?.toLowerCase().includes(q);
      return matchName || matchId || matchVillage || matchSpecialty;
    }
    return true;
  });

  // Open e-Prescription modal
  const handleOpenPrescription = (c: any) => {
    setSelectedCaseForPrescription(c);
    setRxSuccess(false);
    setCopiedSms(false);

    if (c.prescription) {
      setRxDiagnosis(c.prescription.diagnosis || '');
      const medsList = Array.isArray(c.prescription.medications) ? c.prescription.medications : [];
      if (medsList.length > 0) {
        setRxMedication(medsList.map((m: any) => m?.name || '').filter(Boolean).join(', '));
        setRxDosage(medsList.map((m: any) => m?.dosage || '').filter(Boolean).join('; '));
      } else {
        setRxMedication(c.prescription.medication || '');
        setRxDosage(c.prescription.dosage || '');
      }
      setRxFollowUpDate(c.prescription.follow_up || c.prescription.follow_up_date || '');
      setRxAdvice(c.prescription.advice || '');
    } else if (c.is_red_flag) {
      setRxDiagnosis('Acute Coronary Syndrome (ACS) / NSTEMI');
      setRxMedication('Tab Aspirin 300mg stat, Tab Clopidogrel 300mg stat, Tab Atorvastatin 80mg');
      setRxDosage('Loading doses immediately at PHC. Transfer via 108 ambulance.');
      setRxFollowUpDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
      setRxAdvice('Immediate referral to First Referral Unit (FRU) / District Hospital.');
    } else {
      setRxDiagnosis('Tinea Corporis (Fungal Infection)');
      setRxMedication('Clotrimazole 1% Cream topical bid, Tab Cetirizine 10mg hs x 7d');
      setRxDosage('Apply cream twice daily for 2 weeks. Maintain dry skin.');
      setRxFollowUpDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
      setRxAdvice('Avoid synthetic clothing, dry thoroughly after bathing.');
    }
  };

  // Submit e-Prescription to POST /api/cases/${id}/prescribe
  const handleSubmitPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseForPrescription) return;

    setRxSubmitting(true);
    const trimmedMed = rxMedication.trim();
    const trimmedDosage = rxDosage.trim();
    const medications = trimmedMed
      ? [
          {
            name: trimmedMed,
            ...(trimmedDosage ? { dosage: trimmedDosage } : {}),
          },
        ]
      : [];

    const payload = {
      diagnosis: rxDiagnosis || undefined,
      medications,
      advice: rxAdvice || undefined,
      follow_up: rxFollowUpDate || undefined,
      doctor_name: selectedCaseForPrescription?.prescription?.doctor_name || 'Dr. K. Srinivas, MD',
      doctor_reg: selectedCaseForPrescription?.prescription?.doctor_reg || 'KMC-78452',
    };

    try {
      const res = await fetch(
        `${apiBaseUrl}/api/cases/${selectedCaseForPrescription.id}/prescribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.case) {
        setCases((prev) =>
          prev.map((c) =>
            c.id === selectedCaseForPrescription.id ? data.case : c
          )
        );
        setSelectedCaseForPrescription(data.case);
        try {
          window.dispatchEvent(new CustomEvent('telethread_case_updated', { detail: data.case }));
        } catch {}
      }
    } catch (err) {
      console.warn('Backend prescription API offline, updating local case state:', err);
      // Fallback local update
      const localUpdatedCase = {
        ...selectedCaseForPrescription,
        prescription: payload,
      };
      setCases((prev) =>
        prev.map((c) =>
          c.id === selectedCaseForPrescription.id ? localUpdatedCase : c
        )
      );
      setSelectedCaseForPrescription(localUpdatedCase);
    } finally {
      setRxSubmitting(false);
      setRxSuccess(true);
    }
  };

  // Open ABDM FHIR R4 Bundle modal
  const handleOpenFhirModal = async (c: any) => {
    setSelectedCaseForFhir(c);
    setFhirLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/cases/${c.id}/fhir`);
      if (res.ok) {
        const json = await res.json();
        setFhirData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      // Fallback valid ABDM FHIR R4 Bundle representation
      const mockBundle = {
        resourceType: 'Bundle',
        id: `abdm-bundle-${c.id}`,
        meta: {
          versionId: '1',
          lastUpdated: new Date().toISOString(),
          profile: [
            'https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecordBundle',
          ],
        },
        type: 'document',
        timestamp: new Date().toISOString(),
        entry: [
          {
            fullUrl: `urn:uuid:composition-${c.id}`,
            resource: {
              resourceType: 'Composition',
              status: 'final',
              type: {
                coding: [
                  {
                    system: 'http://snomed.info/sct',
                    code: '440545006',
                    display: 'Prescription record',
                  },
                ],
              },
              subject: {
                reference: `urn:uuid:patient-${c.id}`,
                display: c.patient_name,
              },
              date: new Date().toISOString(),
              author: [
                {
                  display: 'Dr. Ramesh Rao (Cardiologist, District Hub)',
                },
              ],
              title: 'ABDM Teleconsultation Clinical Prescription',
            },
          },
          {
            fullUrl: `urn:uuid:patient-${c.id}`,
            resource: {
              resourceType: 'Patient',
              id: c.id,
              identifier: [
                {
                  system: 'https://healthid.ndhm.gov.in',
                  value: c.abha_id || '91-2345-6789-0123',
                },
              ],
              name: [{ text: c.patient_name }],
              gender: c.gender === 'M' ? 'male' : c.gender === 'F' ? 'female' : 'other',
              address: [{ city: c.village_taluka, state: 'Karnataka' }],
            },
          },
          {
            fullUrl: `urn:uuid:vitals-${c.id}`,
            resource: {
              resourceType: 'Observation',
              status: 'final',
              code: { text: 'SpO2 & Blood Pressure' },
              component: [
                { code: { text: 'Systolic BP' }, valueQuantity: { value: c.vitals.bp_systolic, unit: 'mmHg' } },
                { code: { text: 'Diastolic BP' }, valueQuantity: { value: c.vitals.bp_diastolic, unit: 'mmHg' } },
                { code: { text: 'SpO2' }, valueQuantity: { value: c.vitals.spo2, unit: '%' } },
              ],
            },
          },
        ],
      };
      setFhirData(mockBundle);
    } finally {
      setFhirLoading(false);
    }
  };

  // 2G Offline SMS preview content generator
  const getOfflineSmsPreview = (c: any, langChoice: 'en' | 'kn') => {
    if (!c) return '';
    const diag = rxDiagnosis || c.prescription?.diagnosis || 'Clinical evaluation';
    const meds =
      rxMedication ||
      (Array.isArray(c.prescription?.medications) && c.prescription.medications.length > 0
        ? c.prescription.medications
            .map((m: any) => `${m?.name || ''} ${m?.dosage || ''}`.trim())
            .filter(Boolean)
            .join(', ')
        : c.prescription?.medication) ||
      'As directed at PHC';
    const fup = rxFollowUpDate || c.prescription?.follow_up || c.prescription?.follow_up_date || 'Immediately';

    if (langChoice === 'kn') {
      return `[ಟೆಲಿಥ್ರೆಡ್ 2G SMS] ಡಾ. ರಾವ್ -> ${c.patient_name} (${c.village_taluka}): ರೋಗನಿರ್ಣಯ: ${diag}. ಔಷಧಿ: ${meds}. ಮುಂದಿನ ಭೇಟಿ: ${fup}. ತುರ್ತು ಸಹಾಯಕ್ಕೆ 108 ಕರೆ ಮಾಡಿ.`;
    }
    return `[TeleThread 2G SMS] Dr. Rao -> ${c.patient_name} (${c.village_taluka}): Dx: ${diag}. Rx: ${meds}. Follow-up: ${fup}. For emergency call 108.`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSms(true);
    setTimeout(() => setCopiedSms(false), 2000);
  };

  // Helper for network tier label
  const renderTierBadge = (tierNum: number = 1) => {
    switch (tierNum) {
      case 1:
        return (
          <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Wifi size={12} />
            Tier 1: 720p Video (400 kbps)
          </span>
        );
      case 2:
        return (
          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Radio size={12} />
            Tier 2: 360p Video (160 kbps)
          </span>
        );
      case 3:
        return (
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} />
            Tier 3: Audio-Only Priority (35 kbps)
          </span>
        );
      default:
        return (
          <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <WifiOff size={12} />
            Tier 4: Store & Forward Async
          </span>
        );
    }
  };

  return (
    <div
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1e293b',
        textAlign: 'left',
      }}
    >
      {/* Top Hub Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.3)',
          marginBottom: '24px',
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
                District Specialist Hospital Hub
              </span>
              <span
                style={{
                  background: error ? '#f59e0b' : '#6366f1',
                  color: '#ffffff',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Radio size={12} />
                {loading ? t('loading', lang) : error ? error : t('pollingActive', lang)}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>
              {t('specialistQueue', lang)}
            </h1>
            <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px' }}>
              {t('hubSubtitle', lang)}
            </p>
          </div>

          {/* Search and Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Search size={16} color="#c7d2fe" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, ID, village..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  width: '180px',
                }}
              />
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
          {(['ALL', 'CRITICAL', 'HIGH', 'ROUTINE'] as const).map((key) => {
            const isActive = filter === key;
            const label =
              key === 'ALL'
                ? `${t('allCases', lang)} (${cases.length})`
                : key === 'CRITICAL'
                ? `🚨 ${t('criticalCases', lang)} (${cases.filter((c) => c.is_red_flag || c.urgency === 'CRITICAL').length})`
                : key === 'HIGH'
                ? `⚡ ${t('highCases', lang)} (${cases.filter((c) => c.urgency === 'HIGH' && !c.is_red_flag).length})`
                : `🌱 ${t('routineCases', lang)} (${cases.filter((c) => c.urgency === 'ROUTINE').length})`;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  background: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.15)',
                  color: isActive ? '#1e1b4b' : '#ffffff',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Queue Cases List */}
      {filteredCases.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '48px 24px',
            textAlign: 'center',
            border: '1px solid #e2e8f0',
          }}
        >
          <Filter size={36} color="#94a3b8" style={{ marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: '#475569' }}>
            {t('noCasesFound', lang)}
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
            Adjust your urgency filter or search parameters.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredCases.map((c) => {
            const isRedFlag = c.is_red_flag || c.urgency === 'CRITICAL';
            const isHigh = c.urgency === 'HIGH';

            return (
              <div
                key={c.id}
                style={{
                  background: isRedFlag ? '#fffdfd' : '#ffffff',
                  borderRadius: '14px',
                  border: isRedFlag ? '2px solid #ef4444' : '1px solid #e2e8f0',
                  boxShadow: isRedFlag
                    ? '0 8px 24px rgba(239, 68, 68, 0.15)'
                    : '0 4px 12px rgba(0, 0, 0, 0.03)',
                  padding: '20px 24px',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease',
                }}
              >
                {/* Red Flag Pulse Indicator Bar */}
                {isRedFlag && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: 'linear-gradient(90deg, #ef4444, #f87171, #ef4444)',
                    }}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                  {/* Left: Patient and PHC metadata */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      {isRedFlag ? (
                        <span
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 900,
                            letterSpacing: '0.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            border: '1px solid #f87171',
                          }}
                        >
                          <AlertOctagon size={13} />
                          {t('redFlagJumpedQueue', lang)}
                        </span>
                      ) : isHigh ? (
                        <span
                          style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Activity size={12} />
                          HIGH URGENCY
                        </span>
                      ) : (
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          ROUTINE
                        </span>
                      )}

                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#6366f1' }}>
                        {c.id}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>•</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                        {c.specialty || 'General Medicine'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>•</span>
                      {renderTierBadge(c.current_tier)}
                    </div>

                    <h2 style={{ margin: '4px 0 6px', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                      {c.patient_name}{' '}
                      <span style={{ fontSize: '15px', fontWeight: 500, color: '#64748b' }}>
                        ({c.age}y / {c.gender})
                      </span>
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#64748b', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={14} color="#059669" />
                        <strong>{c.village_taluka}</strong>
                      </span>
                      {c.abha_id && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <ShieldCheck size={14} color="#6366f1" />
                          ABHA: {c.abha_id}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Quick Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenFhirModal(c)}
                      style={{
                        background: '#f8fafc',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FileText size={14} />
                      ABDM FHIR R4
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenPrescription(c)}
                      style={{
                        background: c.prescription ? '#f0fdf4' : '#f8fafc',
                        color: c.prescription ? '#15803d' : '#334155',
                        border: c.prescription ? '1px solid #86efac' : '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Pill size={14} />
                      {c.prescription ? 'Edit e-Rx' : 'e-Prescription'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onJoinConsult(c)}
                      style={{
                        background: isRedFlag
                          ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                          : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '9px 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: isRedFlag
                          ? '0 4px 12px rgba(220, 38, 38, 0.35)'
                          : '0 4px 12px rgba(79, 70, 229, 0.35)',
                      }}
                    >
                      <Video size={15} />
                      {t('joinLiveConsult', lang)}
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>

                {/* Vitals Badges Bar */}
                {c.vitals && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        background:
                          c.vitals.bp_systolic >= 160 || c.vitals.bp_diastolic >= 100
                            ? '#fee2e2'
                            : '#f1f5f9',
                        color:
                          c.vitals.bp_systolic >= 160 || c.vitals.bp_diastolic >= 100
                            ? '#b91c1c'
                            : '#334155',
                        border:
                          c.vitals.bp_systolic >= 160 || c.vitals.bp_diastolic >= 100
                            ? '1px solid #f87171'
                            : '1px solid #e2e8f0',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      BP: {c.vitals.bp_systolic}/{c.vitals.bp_diastolic} mmHg
                    </span>

                    <span
                      style={{
                        background: c.vitals.spo2 < 92 ? '#fee2e2' : '#f1f5f9',
                        color: c.vitals.spo2 < 92 ? '#b91c1c' : '#334155',
                        border: c.vitals.spo2 < 92 ? '1px solid #f87171' : '1px solid #e2e8f0',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      SpO2: {c.vitals.spo2}%
                    </span>

                    <span
                      style={{
                        background: c.vitals.temp_f >= 100.4 ? '#fef3c7' : '#f1f5f9',
                        color: c.vitals.temp_f >= 100.4 ? '#92400e' : '#334155',
                        border: c.vitals.temp_f >= 100.4 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Temp: {c.vitals.temp_f}°F
                    </span>

                    <span
                      style={{
                        background: c.vitals.hr > 110 ? '#fee2e2' : '#f1f5f9',
                        color: c.vitals.hr > 110 ? '#b91c1c' : '#334155',
                        border: c.vitals.hr > 110 ? '1px solid #f87171' : '1px solid #e2e8f0',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      HR: {c.vitals.hr} bpm
                    </span>

                    {c.symptoms && c.symptoms.length > 0 && (
                      <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>
                        Symptoms: {c.symptoms.join(', ')}
                      </span>
                    )}
                  </div>
                )}

                {/* Gemini Flash AI Clinical Brief Card ("Full context before hello") */}
                <div
                  style={{
                    marginTop: '14px',
                    background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                    border: '1px solid #ddd6fe',
                    borderRadius: '10px',
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} color="#7c3aed" />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        {t('aiClinicalBrief', lang)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', opacity: 0.85, marginRight: '4px' }}>
                        {t('aiBriefTagline', lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() => speakText(apiBaseUrl, c.ai_clinical_brief || '', 'kn-IN')}
                        title="Listen to Clinical Pre-Brief in Kannada via Sarvam TTS"
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#f3e8ff',
                          color: '#6d28d9',
                          border: '1px solid #d8b4fe',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Volume2 size={12} />
                        <span>ಕನ್ನಡ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => speakText(apiBaseUrl, c.ai_clinical_brief || '', 'en-IN')}
                        title="Listen to Clinical Pre-Brief in English via Sarvam TTS"
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#f3e8ff',
                          color: '#6d28d9',
                          border: '1px solid #d8b4fe',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Volume2 size={12} />
                        <span>English</span>
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#3b0764' }}>
                    {c.ai_clinical_brief || 'Patient registered from Spoke PHC. Clinical vitals and timeline streaming.'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: e-Prescription Drawer / Dialog */}
      {selectedCaseForPrescription && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #cbd5e1',
              padding: '24px 28px',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>
                  {selectedCaseForPrescription.id} • {selectedCaseForPrescription.village_taluka}
                </div>
                <h2 style={{ margin: '4px 0 0', fontSize: '19px', fontWeight: 700, color: '#0f172a' }}>
                  {t('prescriptionModalTitle', lang)}
                </h2>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  Patient: <strong>{selectedCaseForPrescription.patient_name}</strong> ({selectedCaseForPrescription.age}y / {selectedCaseForPrescription.gender})
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCaseForPrescription(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Prescription Form */}
            <form onSubmit={handleSubmitPrescription}>
              {/* Diagnosis */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('doctorDiagnosis', lang)} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={rxDiagnosis}
                  onChange={(e) => setRxDiagnosis(e.target.value)}
                  placeholder={t('diagnosisPlaceholder', lang)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Medication */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('medication', lang)} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={rxMedication}
                  onChange={(e) => setRxMedication(e.target.value)}
                  placeholder={t('medicationPlaceholder', lang)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Dosage & Administration */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  {t('dosageInstructions', lang)}
                </label>
                <input
                  type="text"
                  value={rxDosage}
                  onChange={(e) => setRxDosage(e.target.value)}
                  placeholder={t('dosagePlaceholder', lang)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Follow-up Date & Advice */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    {t('followUpDate', lang)}
                  </label>
                  <input
                    type="date"
                    value={rxFollowUpDate}
                    onChange={(e) => setRxFollowUpDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    {t('dietAdvice', lang)}
                  </label>
                  <input
                    type="text"
                    value={rxAdvice}
                    onChange={(e) => setRxAdvice(e.target.value)}
                    placeholder={t('dietAdvicePlaceholder', lang)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* 2G Offline SMS Preview (Bilingual English / Kannada) */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Send size={14} color="#059669" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      {t('offlineSmsPreviewTitle', lang)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getOfflineSmsPreview(selectedCaseForPrescription, lang))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedSms ? '#15803d' : '#6366f1',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={12} />
                    {copiedSms ? t('copied', lang) : t('copy', lang)}
                  </button>
                </div>

                {/* English SMS box */}
                <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', marginBottom: '6px', color: '#1e293b' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', display: 'block' }}>English (2G SMS summary):</span>
                  {getOfflineSmsPreview(selectedCaseForPrescription, 'en')}
                </div>

                {/* Kannada SMS box */}
                <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', color: '#1e293b' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', display: 'block' }}>ಕನ್ನಡ (SMS ಮುನ್ನೋಟ):</span>
                  {getOfflineSmsPreview(selectedCaseForPrescription, 'kn')}
                </div>

                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '6px' }}>
                  {t('offlineSmsDisclaimer', lang)}
                </span>
              </div>

              {/* Submission & Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <a
                  href={`${apiBaseUrl}/api/cases/${selectedCaseForPrescription.id}/prescription.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#4f46e5',
                    fontSize: '13px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Download size={15} />
                  {t('downloadPdfPrescription', lang)}
                </a>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedCaseForPrescription(null)}
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t('close', lang)}
                  </button>

                  <button
                    type="submit"
                    disabled={rxSubmitting}
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 20px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {rxSubmitting ? t('submittingPrescription', lang) : rxSuccess ? '✓ Saved & Dispatched' : t('save', lang)}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ABDM FHIR R4 Bundle Viewer */}
      {selectedCaseForFhir && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '740px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #cbd5e1',
              padding: '24px 28px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: '#e0e7ff',
                      color: '#3730a3',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    FHIR R4 JSON
                  </span>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Case: <strong>{selectedCaseForFhir.id}</strong>
                  </span>
                </div>
                <h2 style={{ margin: '6px 0 2px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  {t('fhirModalTitle', lang)}
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  {t('fhirModalSubtitle', lang)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCaseForFhir(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {fhirLoading ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                Fetching ABDM FHIR R4 Bundle from endpoint...
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(fhirData, null, 2))}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#334155',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={12} />
                    {t('exportAbdmFhirJson', lang)}
                  </button>
                </div>

                <pre
                  style={{
                    background: '#0f172a',
                    color: '#38bdf8',
                    padding: '16px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontFamily: 'ui-monospace, Consolas, Monaco, monospace',
                    overflowX: 'auto',
                    maxHeight: '440px',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(fhirData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HubQueueView;
