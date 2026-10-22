# TeleThread Shared Contract (DO NOT CHANGE FIELD NAMES)

## 1. Backend Base URL
- Local Dev: `http://localhost:8000`
- WebSocket URL: `ws://localhost:8000/ws/consult/{case_id}/{role}` (role = "spoke" | "hub")

## 2. Case Object Schema (Returned by GET/POST /api/cases)
{
  "id": "TT-101",
  "patient_name": "Ramesh Gowda",
  "age": 54,
  "gender": "M",
  "abha_id": "91-2345-6789-0123",
  "consent_given": true,
  "village_taluka": "Sullia PHC",
  "symptoms": ["chest_pain", "sweating"],
  "vitals": { "bp_systolic": 185, "bp_diastolic": 110, "spo2": 89, "temp_f": 99.1, "hr": 112 },
  "is_red_flag": true,
  "emergency_action": "ALERT HUB: Advise 108 / 112 immediately and refer to nearest FRU.",
  "specialty": "Cardiology / Emergency",
  "urgency": "CRITICAL",
  "current_tier": 1,
  "ai_clinical_brief": "54M from Sullia PHC with acute chest pain, SpO2 89%, BP 185/110. High risk.",
  "timeline": [
    { "timestamp": "10:15:02", "type": "TRIAGE", "content": "Case registered at Spoke" },
    { "timestamp": "10:16:10", "type": "PHOTO", "url": "data:image/webp;base64,...", "tier": 3 },
    { "timestamp": "10:17:00", "type": "VOICE_NOTE", "transcript": "Patient reports radiating pain", "tier": 4 }
  ],
  "prescription": null
}
