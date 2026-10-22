export type Language = 'en' | 'kn';

export interface TranslationDict {
  // App & Common
  appTitle: string;
  appSubtitle: string;
  spokeViewTitle: string;
  hubViewTitle: string;
  benchmarksTitle: string;
  switchLanguage: string;
  loading: string;
  error: string;
  refresh: string;
  close: string;
  cancel: string;
  save: string;
  copy: string;
  copied: string;

  // Spoke PHC Registration & Triage
  patientRegistration: string;
  patientRegSubtitle: string;
  patientName: string;
  patientNamePlaceholder: string;
  age: string;
  agePlaceholder: string;
  gender: string;
  genderMale: string;
  genderFemale: string;
  genderOther: string;
  selectVillagePhc: string;
  abhaId: string;
  abhaIdPlaceholder: string;
  abhaHint: string;
  informedConsent: string;
  informedConsentLabel: string;
  consentRequiredError: string;
  demoButtonsTitle: string;
  fillRedFlagDemo: string;
  fillRoutineDemo: string;

  // Vitals
  vitalsTitle: string;
  vitalsSubtitle: string;
  bpSystolic: string;
  bpDiastolic: string;
  spo2: string;
  tempF: string;
  heartRate: string;
  unitMmHg: string;
  unitPercent: string;
  unitFahrenheit: string;
  unitBpm: string;

  // Guided Triage Checklist
  guidedTriageTitle: string;
  guidedTriageSubtitle: string;
  redFlagSymptomsGroup: string;
  routineSymptomsGroup: string;
  symptomChestPain: string;
  symptomSnakebite: string;
  symptomSevereBreathlessness: string;
  symptomAlteredSensorium: string;
  symptomSkinRash: string;
  symptomPersistentFever: string;
  symptomJointPain: string;
  symptomGiUpset: string;
  symptomChronicFollowup: string;

  // Actions & Alerts
  submitTriageCase: string;
  submittingCase: string;
  redFlagAlertTitle: string;
  redFlagAlertMessage: string;
  enterPriorityConsult: string;
  routineSuccessTitle: string;
  routineSuccessMessage: string;
  startRoutineConsult: string;

  // Hub Specialist Queue
  specialistQueue: string;
  hubSubtitle: string;
  pollingActive: string;
  allCases: string;
  criticalCases: string;
  highCases: string;
  routineCases: string;
  noCasesFound: string;
  redFlagJumpedQueue: string;
  aiClinicalBrief: string;
  aiBriefTagline: string;
  vitalsSummary: string;
  networkTier: string;
  tier1Badge: string;
  tier2Badge: string;
  tier3Badge: string;
  tier4Badge: string;
  joinLiveConsult: string;
  generatePrescription: string;
  viewFhirBundle: string;

  // e-Prescription & ABDM FHIR
  prescriptionModalTitle: string;
  doctorDiagnosis: string;
  diagnosisPlaceholder: string;
  medication: string;
  medicationPlaceholder: string;
  dosageInstructions: string;
  dosagePlaceholder: string;
  followUpDate: string;
  dietAdvice: string;
  dietAdvicePlaceholder: string;
  submittingPrescription: string;
  prescriptionSavedSuccess: string;
  offlineSmsPreviewTitle: string;
  offlineSmsDisclaimer: string;
  downloadPdfPrescription: string;
  exportAbdmFhirJson: string;
  fhirModalTitle: string;
  fhirModalSubtitle: string;

  // Benchmarks
  benchmarksPageTitle: string;
  benchmarksSubtitle: string;
  profileTitle: string;
  dataEconomyTitle: string;
  dataEconomySubtitle: string;
  webrtcBaseline: string;
  telethreadAdaptive: string;
}

export const translations: Record<Language, TranslationDict> = {
  en: {
    // App & Common
    appTitle: 'TeleThread',
    appSubtitle: 'Resilient Multi-Tier Telemedicine for Rural Primary Health Centres',
    spokeViewTitle: 'Spoke PHC Guided Triage',
    hubViewTitle: 'Hub Specialist Queue',
    benchmarksTitle: 'Engineering Benchmarks',
    switchLanguage: 'ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಿ',
    loading: 'Loading...',
    error: 'An error occurred. Please try again.',
    refresh: 'Refresh',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    copy: 'Copy',
    copied: 'Copied!',

    // Spoke PHC Registration & Triage
    patientRegistration: 'Patient Registration & Triage',
    patientRegSubtitle: 'Sullia Taluk & Coastal Karnataka PHC Network',
    patientName: 'Patient Full Name',
    patientNamePlaceholder: 'e.g. Ramesh Gowda',
    age: 'Age (Years)',
    agePlaceholder: 'e.g. 54',
    gender: 'Gender',
    genderMale: 'Male (M)',
    genderFemale: 'Female (F)',
    genderOther: 'Other',
    selectVillagePhc: 'Select Village / PHC Sub-Centre',
    abhaId: 'ABHA ID (Ayushman Bharat Health Account)',
    abhaIdPlaceholder: 'XX-XXXX-XXXX-XXXX (Optional)',
    abhaHint: '14-digit ABDM Ayushman Bharat Health Account ID',
    informedConsent: 'Informed Consent',
    informedConsentLabel: 'I confirm that the patient/guardian has provided informed verbal/written consent for teleconsultation under the Telemedicine Practice Guidelines of India.',
    consentRequiredError: 'Informed patient consent is mandatory prior to teleconsultation.',
    demoButtonsTitle: '1-Click Demo Scenarios (Fast Video Recording)',
    fillRedFlagDemo: '⚡ Fill Red-Flag Demo (Ramesh Gowda - Sullia)',
    fillRoutineDemo: '🌱 Fill Routine Demo (Manjula Nayak - Karkala)',

    // Vitals
    vitalsTitle: 'Patient Vital Signs',
    vitalsSubtitle: 'Automated clinical threshold detection for red flags',
    bpSystolic: 'Systolic BP',
    bpDiastolic: 'Diastolic BP',
    spo2: 'SpO2 Oxygen',
    tempF: 'Temperature',
    heartRate: 'Heart Rate',
    unitMmHg: 'mmHg',
    unitPercent: '%',
    unitFahrenheit: '°F',
    unitBpm: 'bpm',

    // Guided Triage Checklist
    guidedTriageTitle: 'Guided Clinical Triage Checklist',
    guidedTriageSubtitle: 'Select all presenting symptoms and danger signs',
    redFlagSymptomsGroup: '🚨 Red Flag Emergency Symptoms (Auto-Elevate to Hub Alert)',
    routineSymptomsGroup: '📋 Routine & Chronic Symptoms',
    symptomChestPain: 'Acute Chest Pain / Heavy Sweating / Radiating Pain',
    symptomSnakebite: 'Snakebite / Severe Trauma / Profuse Bleeding',
    symptomSevereBreathlessness: 'Severe Breathlessness / Stridor / Cyanosis (Blue Lips)',
    symptomAlteredSensorium: 'Altered Sensorium / Sudden Slurred Speech / Stroke Sign',
    symptomSkinRash: 'Skin Rash / Fungal Infection / Dermatitis',
    symptomPersistentFever: 'Persistent High Fever (>3 days) / Chills',
    symptomJointPain: 'Chronic Joint Pain / Musculoskeletal Ache',
    symptomGiUpset: 'Gastrointestinal Pain / Diarrhea / Vomiting',
    symptomChronicFollowup: 'Hypertension / Diabetes Routine Follow-up',

    // Actions & Alerts
    submitTriageCase: 'Submit Triage Case to Hub Queue',
    submittingCase: 'Submitting Case & Evaluating Clinical Risk...',
    redFlagAlertTitle: '🚨 RED FLAG EMERGENCY ALERT: CALL 108 / 112',
    redFlagAlertMessage: 'Patient exhibits critical life-threatening indicators! Advise 108 / 112 ambulance immediately and refer to the nearest First Referral Unit (FRU). Hub specialists have been alerted with queue-jump priority.',
    enterPriorityConsult: '⚡ Enter Priority Live Consult (Zero-Restart Channel)',
    routineSuccessTitle: '✓ Routine Case Registered Successfully',
    routineSuccessMessage: 'Case has been routed to the District Hospital Specialist Queue. Average wait time ~3 minutes.',
    startRoutineConsult: 'Connect to TeleThread Consult Room',

    // Hub Specialist Queue
    specialistQueue: 'District Hub Specialist Queue',
    hubSubtitle: 'Urgency-prioritized queue with Gemini Flash AI Clinical Briefs',
    pollingActive: 'Live Queue Polling (every 3s)',
    allCases: 'All Cases',
    criticalCases: 'Critical / Red Flag',
    highCases: 'High Urgency',
    routineCases: 'Routine',
    noCasesFound: 'No cases found matching the selected filter.',
    redFlagJumpedQueue: 'RED FLAG - JUMPED QUEUE',
    aiClinicalBrief: 'Gemini Flash AI Clinical Brief',
    aiBriefTagline: 'Full context before hello — Instant clinical synthesis',
    vitalsSummary: 'Vitals Summary',
    networkTier: 'Current Spoke Link Tier',
    tier1Badge: 'Tier 1: 720p Video (Adaptive 400 kbps)',
    tier2Badge: 'Tier 2: 360p Video (160 kbps)',
    tier3Badge: 'Tier 3: Audio-Only Priority (35 kbps)',
    tier4Badge: 'Tier 4: Store & Forward Async (Offline 2G)',
    joinLiveConsult: 'Join Live Consult',
    generatePrescription: 'Generate e-Prescription',
    viewFhirBundle: 'View ABDM FHIR R4 Bundle',

    // e-Prescription & ABDM FHIR
    prescriptionModalTitle: 'Generate ABDM-Compliant e-Prescription',
    doctorDiagnosis: 'Primary Clinical Diagnosis',
    diagnosisPlaceholder: 'e.g. Acute Coronary Syndrome (ACS) / NSTEMI vs Unstable Angina',
    medication: 'Medications & Prescribed Drugs',
    medicationPlaceholder: 'e.g. Tab Aspirin 300mg stat, Tab Clopidogrel 300mg stat, Tab Atorvastatin 80mg',
    dosageInstructions: 'Dosage & Administration Instructions',
    dosagePlaceholder: 'e.g. 1 stat loading dose at PHC, oxygen via mask, transfer immediately via 108 ambulance',
    followUpDate: 'Follow-up Date / Referral Destination',
    dietAdvice: 'Dietary & Supportive Advice',
    dietAdvicePlaceholder: 'e.g. Complete bed rest, continuous ECG monitoring, NPO (nil per os)',
    submittingPrescription: 'Saving e-Prescription & Generating 2G SMS...',
    prescriptionSavedSuccess: 'Prescription successfully finalized and archived to ABDM health record.',
    offlineSmsPreviewTitle: '2G Offline SMS Preview (Bilingual Fallback)',
    offlineSmsDisclaimer: 'This compressed 140-char text is automatically transmitted to the patient and PHC nurse phone when cellular link drops to 2G/GPRS.',
    downloadPdfPrescription: 'Download Official PDF e-Rx',
    exportAbdmFhirJson: 'Export ABDM FHIR JSON',
    fhirModalTitle: 'ABDM FHIR R4 Clinical Artifacts Bundle',
    fhirModalSubtitle: 'Standardized Ayushman Bharat Digital Mission (ABDM) Electronic Health Record',

    // Benchmarks
    benchmarksPageTitle: 'TeleThread Engineering Benchmarks & Validation',
    benchmarksSubtitle: 'Proving deterministic resilience: 4-Tier Adaptive Engine vs Plain Video-First WebRTC under Western Ghats 2G/3G link constraints',
    profileTitle: 'Linux tc netem Network Emulation Profiles',
    dataEconomyTitle: 'Estimated Data per 10-Minute Consult',
    dataEconomySubtitle: 'Measured data consumption across TeleThread adaptive fallback tiers',
    webrtcBaseline: 'Plain Video-First WebRTC (Vanilla Google Meet / Zoom style)',
    telethreadAdaptive: 'TeleThread 4-Tier Zero-Restart Adaptive Engine',
  },
  kn: {
    // App & Common
    appTitle: 'ಟೆಲಿಥ್ರೆಡ್',
    appSubtitle: 'ಗ್ರಾಮೀಣ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಗಳಿಗಾಗಿ ಸ್ಥಿತಿಸ್ಥಾಪಕ ಮಲ್ಟಿ-ಟೈರ್ ಟೆಲಿಮೆಡಿಸಿನ್',
    spokeViewTitle: 'ಸ್ಪೋಕ್ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ ಟ್ರಯೇಜ್',
    hubViewTitle: 'ಹಬ್ ತಜ್ಞ ವೈದ್ಯರ ಸರದಿ',
    benchmarksTitle: 'ಇಂಜಿನಿಯರಿಂಗ್ ಮಾನದಂಡಗಳು',
    switchLanguage: 'Switch to English',
    loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...',
    error: 'ದೋಷ ಸಂಭವಿಸಿದೆ. ದಯವಿಟ್ಟು ಪುನಃ ಪ್ರಯತ್ನಿಸಿ.',
    refresh: 'ಪುನಶ್ಚೇತನಗೊಳಿಸಿ',
    close: 'ಮುಚ್ಚಿ',
    cancel: 'ರದ್ದುಮಾಡಿ',
    save: 'ಉಳಿಸಿ',
    copy: 'ನಕಲಿಸಿ',
    copied: 'ನಕಲಿಸಲಾಗಿದೆ!',

    // Spoke PHC Registration & Triage
    patientRegistration: 'ರೋಗಿ ನೋಂದಣಿ ಮತ್ತು ಟ್ರಯೇಜ್',
    patientRegSubtitle: 'ಸುಳ್ಯ ತಾಲೂಕು ಮತ್ತು ಕರಾವಳಿ ಕರ್ನಾಟಕ ಪಿಎಚ್‌ಸಿ ನೆಟ್‌ವರ್ಕ್',
    patientName: 'ರೋಗಿಯ ಪೂರ್ಣ ಹೆಸರು',
    patientNamePlaceholder: 'ಉದಾ: ರಮೇಶ್ ಗೌಡ',
    age: 'ವಯಸ್ಸು (ವರ್ಷಗಳು)',
    agePlaceholder: 'ಉದಾ: 54',
    gender: 'ಲಿಂಗ',
    genderMale: 'ಪುರುಷ (M)',
    genderFemale: 'ಮಹಿಳೆ (F)',
    genderOther: 'ಇತರ',
    selectVillagePhc: 'ಗ್ರಾಮ / ಪಿಎಚ್‌ಸಿ ಉಪ-ಕೇಂದ್ರ ಆಯ್ಕೆಮಾಡಿ',
    abhaId: 'ಆಭಾ ಐಡಿ (ಆಯುಷ್ಮಾನ್ ಭಾರತ್ ಆರೋಗ್ಯ ಖಾತೆ)',
    abhaIdPlaceholder: 'XX-XXXX-XXXX-XXXX (ಐಚ್ಛಿಕ)',
    abhaHint: '೧೪ ಅಂಕಿಗಳ ABDM ಆಯುಷ್ಮಾನ್ ಭಾರತ್ ಆರೋಗ್ಯ ಖಾತೆ ಸಂಖ್ಯೆ',
    informedConsent: 'ತಿಳುವಳಿಕೆಯುಳ್ಳ ಸಮ್ಮತಿ',
    informedConsentLabel: 'ಭಾರತ ಸರ್ಕಾರದ ಟೆಲಿಮೆಡಿಸಿನ್ ಮಾರ್ಗಸೂಚಿಗಳ ಅಡಿಯಲ್ಲಿ ರೋಗಿ/ಪೋಷಕರು ಟೆಲಿ-ಸಮಾಲೋಚನೆಗೆ ಮೌಖಿಕ/ಲಿಖಿತ ಸಮ್ಮತಿ ನೀಡಿದ್ದಾರೆ ಎಂದು ನಾನು ದೃಢೀಕರಿಸುತ್ತೇನೆ.',
    consentRequiredError: 'ಟೆಲಿ-ಸಮಾಲೋಚನೆಗೆ ರೋಗಿಯ ಸಮ್ಮತಿ ಕಡ್ಡಾಯವಾಗಿದೆ.',
    demoButtonsTitle: '೧-ಕ್ಲಿಕ್ ಡೆಮೊ ಸನ್ನಿವೇಶಗಳು (ಕ್ಷಿಪ್ರ ವಿಡಿಯೋ ರೆಕಾರ್ಡಿಂಗ್)',
    fillRedFlagDemo: '⚡ ರೆಡ್-ಫ್ಲ್ಯಾಗ್ ಡೆಮೊ (ರಮೇಶ್ ಗೌಡ - ಸುಳ್ಯ)',
    fillRoutineDemo: '🌱 ಸಾಮಾನ್ಯ ಡೆಮೊ (ಮಂಜುಳಾ ನಾಯಕ್ - ಕಾರ್ಕಳ)',

    // Vitals
    vitalsTitle: 'ರೋಗಿಯ ಜೀವಧಾರಕ ಲಕ್ಷಣಗಳು (ವೈಟಲ್ಸ್)',
    vitalsSubtitle: 'ತುರ್ತು ಪರಿಸ್ಥಿತಿಗಾಗಿ ಸ್ವಯಂಚಾಲಿತ ಕ್ಲಿನಿಕಲ್ ಮಿತಿ ಪತ್ತೆ',
    bpSystolic: 'ಸಿಸ್ಟೊಲಿಕ್ ರಕ್ತದೊತ್ತಡ',
    bpDiastolic: 'ಡಯಾಸ್ಟೊಲಿಕ್ ರಕ್ತದೊತ್ತಡ',
    spo2: 'ಆಮ್ಲಜನಕ ಮಟ್ಟ (SpO2)',
    tempF: 'ದೇಹದ ತಾಪಮಾನ',
    heartRate: 'ಹೃದಯ ಬಡಿತ (ನಾಡಿ)',
    unitMmHg: 'ಎಂಎಂ ಎಚ್‌ಜಿ',
    unitPercent: '%',
    unitFahrenheit: '°F',
    unitBpm: 'ಬಿಪಿಎಂ',

    // Guided Triage Checklist
    guidedTriageTitle: 'ಮಾರ್ಗದರ್ಶಿ ಕ್ಲಿನಿಕಲ್ ಟ್ರಯೇಜ್ ಪರಿಶೀಲನಾ ಪಟ್ಟಿ',
    guidedTriageSubtitle: 'ಎಲ್ಲಾ ರೋಗಲಕ್ಷಣಗಳು ಮತ್ತು ಅಪಾಯದ ಚಿಹ್ನೆಗಳನ್ನು ಗುರುತಿಸಿ',
    redFlagSymptomsGroup: '🚨 ರೆಡ್ ಫ್ಲ್ಯಾಗ್ ತುರ್ತು ರೋಗಲಕ್ಷಣಗಳು (ಸ್ವಯಂ ತುರ್ತು ಎಚ್ಚರಿಕೆ)',
    routineSymptomsGroup: '📋 ಸಾಮಾನ್ಯ ಮತ್ತು ದೀರ್ಘಕಾಲದ ಲಕ್ಷಣಗಳು',
    symptomChestPain: 'ತೀವ್ರ ಎದೆನೋವು / ವಿಪರೀತ ಬೆವರುವುದು / ತೋಳಿಗೆ ಹರಡುವ ನೋವು',
    symptomSnakebite: 'ಹಾವು ಕಡಿತ / ತೀವ್ರ ಗಾಯ / ಅತಿಯಾದ ರಕ್ತಸ್ರಾವ',
    symptomSevereBreathlessness: 'ತೀವ್ರ ಉಸಿರಾಟದ ತೊಂದರೆ / ನೀಲಿ ತುಟಿಗಳು (ಆಮ್ಲಜನಕ ಕೊರತೆ)',
    symptomAlteredSensorium: 'ಪ್ರಜ್ಞಾಹೀನತೆ / ಹಠಾತ್ ತೊದಲುವ ಮಾತು / ಪಾರ್ಶ್ವವಾಯು ಲಕ್ಷಣ',
    symptomSkinRash: 'ಚರ್ಮದ ದದ್ದು / ಶಿಲೀಂಧ್ರ ಸೋಂಕು / ತುರಿಕೆ',
    symptomPersistentFever: 'ನಿರಂತರ ಹೆಚ್ಚಿನ ಜ್ವರ (>೩ ದಿನಗಳು) / ಚಳಿ',
    symptomJointPain: 'ದೀರ್ಘಕಾಲದ ಕೀಲು ನೋವು / ಮೈಕೈ ನೋವು',
    symptomGiUpset: 'ಹೊಟ್ಟೆ ನೋವು / ಭೇದಿ / ವಾಂತಿ',
    symptomChronicFollowup: 'ರಕ್ತದೊತ್ತಡ / ಮಧುಮೇಹ ನಿಯಮಿತ ತಪಾಸಣೆ',

    // Actions & Alerts
    submitTriageCase: 'ಟ್ರಯೇಜ್ ಪ್ರಕರಣವನ್ನು ಹಬ್ ಸರದಿಗೆ ಸಲ್ಲಿಸಿ',
    submittingCase: 'ಪ್ರಕರಣ ದಾಖಲಿಸಿ ಅಪಾಯದ ಮೌಲ್ಯಮಾಪನ ಮಾಡಲಾಗುತ್ತಿದೆ...',
    redFlagAlertTitle: '🚨 ರೆಡ್ ಫ್ಲ್ಯಾಗ್ ತುರ್ತು ಎಚ್ಚರಿಕೆ: 108 / 112 ಗೆ ಕರೆ ಮಾಡಿ',
    redFlagAlertMessage: 'ರೋಗಿಯು ಗಂಭೀರ ಜೀವಕ್ಕೆ ಅಪಾಯಕಾರಿ ಲಕ್ಷಣಗಳನ್ನು ಹೊಂದಿದ್ದಾರೆ! ತಕ್ಷಣ 108 / 112 ಆಂಬ್ಯುಲೆನ್ಸ್‌ಗೆ ಕರೆ ಮಾಡಿ ಮತ್ತು ಹತ್ತಿರದ ತಾಲೂಕು ಆಸ್ಪತ್ರೆಗೆ ಕಳುಹಿಸಿ. ಹಬ್ ತಜ್ಞ ವೈದ್ಯರಿಗೆ ಆದ್ಯತೆಯ ಸಂದೇಶ ರವಾನಿಸಲಾಗಿದೆ.',
    enterPriorityConsult: '⚡ ಆದ್ಯತೆಯ ಲೈವ್ ಸಮಾಲೋಚನೆಗೆ ಪ್ರವೇಶಿಸಿ (ಶೂನ್ಯ-ಮರುಪ್ರಾರಂಭ ಚಾನಲ್)',
    routineSuccessTitle: '✓ ಸಾಮಾನ್ಯ ಪ್ರಕರಣ ಯಶಸ್ವಿಯಾಗಿ ದಾಖಲಾಗಿದೆ',
    routineSuccessMessage: 'ಪ್ರಕರಣವನ್ನು ಜಿಲ್ಲಾ ಆಸ್ಪತ್ರೆಯ ತಜ್ಞರ ಸರದಿಗೆ ಸೇರಿಸಲಾಗಿದೆ. ಸರಾಸರಿ ಕಾಯುವ ಸಮಯ ~೩ ನಿಮಿಷ.',
    startRoutineConsult: 'ಟೆಲಿಥ್ರೆಡ್ ಸಮಾಲೋಚನಾ ಕೋಣೆಗೆ ಸಂಪರ್ಕಿಸಿ',

    // Hub Specialist Queue
    specialistQueue: 'ಜಿಲ್ಲಾ ಹಬ್ ತಜ್ಞ ವೈದ್ಯರ ಸರದಿ',
    hubSubtitle: 'ಜೆಮಿನಿ ಫ್ಲ್ಯಾಶ್ AI ಕ್ಲಿನಿಕಲ್ ಬ್ರೀಫ್ ಜೊತೆ ಆದ್ಯತೆ ಆಧಾರಿತ ಸರದಿ',
    pollingActive: 'ಲೈವ್ ಸರದಿ ಪರಿಶೀಲನೆ (ಪ್ರತಿ ೩ ಸೆಕೆಂಡಿಗೆ)',
    allCases: 'ಎಲ್ಲಾ ಪ್ರಕರಣಗಳು',
    criticalCases: 'ಅತ್ಯಂತ ತುರ್ತು (ರೆಡ್ ಫ್ಲ್ಯಾಗ್)',
    highCases: 'ಹೆಚ್ಚಿನ ಆದ್ಯತೆ',
    routineCases: 'ಸಾಮಾನ್ಯ',
    noCasesFound: 'ಆಯ್ಕೆಮಾಡಿದ ಫಿಲ್ಟರ್‌ಗೆ ಯಾವುದೇ ಪ್ರಕರಣಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
    redFlagJumpedQueue: 'ರೆಡ್ ಫ್ಲ್ಯಾಗ್ - ಸರದಿಯಲ್ಲಿ ಆದ್ಯತೆ',
    aiClinicalBrief: 'ಜೆಮಿನಿ ಫ್ಲ್ಯಾಶ್ AI ಕ್ಲಿನಿಕಲ್ ಸಾರಾಂಶ',
    aiBriefTagline: 'ಮಾತನಾಡುವ ಮುನ್ನವೇ ಪೂರ್ಣ ರೋಗ ವಿವರಣೆ',
    vitalsSummary: 'ವೈಟಲ್ಸ್ ಸಾರಾಂಶ',
    networkTier: 'ಪ್ರಸ್ತುತ ನೆಟ್‌ವರ್ಕ್ ಟೈರ್',
    tier1Badge: 'ಟೈರ್ 1: 720p ವಿಡಿಯೋ (ಅಡಾಪ್ಟಿವ್ 400 kbps)',
    tier2Badge: 'ಟೈರ್ 2: 360p ವಿಡಿಯೋ (160 kbps)',
    tier3Badge: 'ಟೈರ್ 3: ಆಡಿಯೋ-ಮಾತ್ರ ಆದ್ಯತೆ (35 kbps)',
    tier4Badge: 'ಟೈರ್ 4: ಸ್ಟೋರ್ ಮತ್ತು ಫಾರ್ವರ್ಡ್ (2G ಆಫ್‌ಲೈನ್)',
    joinLiveConsult: 'ಲೈವ್ ಸಮಾಲೋಚನೆಗೆ ಸೇರಿ',
    generatePrescription: 'ಇ-ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ರಚಿಸಿ',
    viewFhirBundle: 'ABDM FHIR R4 ಬಂಡಲ್ ವೀಕ್ಷಿಸಿ',

    // e-Prescription & ABDM FHIR
    prescriptionModalTitle: 'ABDM-ಅನುಗುಣವಾದ ಇ-ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ರಚಿಸಿ',
    doctorDiagnosis: 'ಪ್ರಾಥಮಿಕ ರೋಗನಿರ್ಣಯ',
    diagnosisPlaceholder: 'ಉದಾ: ತೀವ್ರ ಹೃದಯ ತೊಂದರೆ (ACS) / NSTEMI',
    medication: 'ಔಷಧಿಗಳು ಮತ್ತು ಮಾತ್ರೆಗಳು',
    medicationPlaceholder: 'ಉದಾ: Tab Aspirin 300mg stat, Tab Clopidogrel 300mg stat, Tab Atorvastatin 80mg',
    dosageInstructions: 'ಪ್ರಮಾಣ ಮತ್ತು ಸೇವನೆಯ ಸೂಚನೆಗಳು',
    dosagePlaceholder: 'ಉದಾ: ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರದಲ್ಲಿ ತಕ್ಷಣವೇ ೧ ಡೋಸ್, 108 ಆಂಬ್ಯುಲೆನ್ಸ್ ಮೂಲಕ ರವಾನೆ',
    followUpDate: 'ಮುಂದಿನ ಭೇಟಿ / ಆಸ್ಪತ್ರೆ ಶಿಫಾರಸು',
    dietAdvice: 'ಆಹಾರ ಮತ್ತು ವಿಶ್ರಾಂತಿ ಸಲಹೆಗಳು',
    dietAdvicePlaceholder: 'ಉದಾ: ಸಂಪೂರ್ಣ ವಿಶ್ರಾಂತಿ, ನಿರಂತರ ಇಸಿಜಿ ನಿಗಾ',
    submittingPrescription: 'ಇ-ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಉಳಿಸಿ 2G SMS ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...',
    prescriptionSavedSuccess: 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅಂತಿಮಗೊಳಿಸಿ ABDM ಆರೋಗ್ಯ ದಾಖಲೆಗೆ ದಾಖಲಿಸಲಾಗಿದೆ.',
    offlineSmsPreviewTitle: '2G ಆಫ್‌ಲೈನ್ SMS ಮುನ್ನೋಟ (ದ್ವಿಭಾಷಾ ಬ್ಯಾಕಪ್)',
    offlineSmsDisclaimer: 'ಸೆಲ್ಯುಲಾರ್ ಸಿಗ್ನಲ್ 2G/GPRS ಗೆ ಕುಸಿದಾಗ ಈ ಸಂಕ್ಷಿಪ್ತ ಪಠ್ಯ ಸಂದೇಶವು ರೋಗಿ ಮತ್ತು ಪಿಎಚ್‌ಸಿ ನರ್ಸ್ ಮೊಬೈಲ್‌ಗೆ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ರವಾನೆಯಾಗುತ್ತದೆ.',
    downloadPdfPrescription: 'ಅಧಿಕೃತ PDF ಇ-ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ',
    exportAbdmFhirJson: 'ABDM FHIR JSON ರಫ್ತು ಮಾಡಿ',
    fhirModalTitle: 'ABDM FHIR R4 ಕ್ಲಿನಿಕಲ್ ಆರ್ಟಿಫ್ಯಾಕ್ಟ್ಸ್ ಬಂಡಲ್',
    fhirModalSubtitle: 'ಆಯುಷ್ಮಾನ್ ಭಾರತ್ ಡಿಜಿಟಲ್ ಮಿಷನ್ ಪ್ರಮಾಣಿತ ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಆರೋಗ್ಯ ದಾಖಲೆ',

    // Benchmarks
    benchmarksPageTitle: 'ಟೆಲಿಥ್ರೆಡ್ ಇಂಜಿನಿಯರಿಂಗ್ ಮಾನದಂಡಗಳು ಮತ್ತು ದೃಢೀಕರಣ',
    benchmarksSubtitle: 'ಪಶ್ಚಿಮ ಘಟ್ಟಗಳ 2G/3G ನೆಟ್‌ವರ್ಕ್ ಮಿತಿಗಳಲ್ಲಿ 4-ಹಂತದ ಅಡಾಪ್ಟಿವ್ ಇಂಜಿನ್ vs ಸಾಂಪ್ರದಾಯಿಕ WebRTC ಯ ಪರಿಣಾಮಕಾರಿ ಹೋಲಿಕೆ',
    profileTitle: 'Linux tc netem ನೆಟ್‌ವರ್ಕ್ ಅನುಕರಣೆ ಪ್ರೊಫೈಲ್‌ಗಳು',
    dataEconomyTitle: '೧೦ ನಿಮಿಷಗಳ ಸಮಾಲೋಚನೆಗೆ ಅಂದಾಜು ಡೇಟಾ',
    dataEconomySubtitle: 'ಟೆಲಿಥ್ರೆಡ್ ಅಡಾಪ್ಟಿವ್ ಫಾಲ್‌ಬ್ಯಾಕ್ ಹಂತಗಳಲ್ಲಿ ದಾಖಲಾದ ಡೇಟಾ ಬಳಕೆ',
    webrtcBaseline: 'ಸಾಂಪ್ರದಾಯಿಕ ವಿಡಿಯೋ-ಮೊದಲ WebRTC (ಗೂಗಲ್ ಮೀಟ್ / ಜೂಮ್ ಶೈಲಿ)',
    telethreadAdaptive: 'ಟೆಲಿಥ್ರೆಡ್ 4-ಹಂತದ ಶೂನ್ಯ-ಮರುಪ್ರಾರಂಭ ಅಡಾಪ್ಟಿವ್ ಇಂಜಿನ್',
  },
};

export const t = (key: keyof TranslationDict, lang: Language = 'en'): string => {
  const dict = translations[lang] || translations.en;
  return dict[key] || translations.en[key] || key;
};
