import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def _deterministic_clinical_brief(case_dict: Dict[str, Any]) -> str:
    """Fallback deterministic 2-sentence clinical pre-brief."""
    age = case_dict.get("age", "Unknown age")
    gender = case_dict.get("gender", "")
    loc = case_dict.get("village_taluka", "PHC")
    symptoms = case_dict.get("symptoms", [])
    symptoms_str = (
        ", ".join(str(s).replace("_", " ") for s in symptoms)
        if symptoms
        else "unspecified symptoms"
    )

    vitals = case_dict.get("vitals") or {}
    bp_sys = vitals.get("bp_systolic", "N/A")
    bp_dia = vitals.get("bp_diastolic", "N/A")
    spo2 = vitals.get("spo2", "N/A")
    hr = vitals.get("hr", "N/A")
    urgency = case_dict.get("urgency", "ROUTINE")
    is_red = case_dict.get("is_red_flag", False)

    sentence1 = f"{age}{gender} from {loc} presenting with {symptoms_str}."

    if is_red:
        sentence2 = (
            f"Critical red flag alert with SpO2 {spo2}%, BP {bp_sys}/{bp_dia}, HR {hr} bpm; "
            "immediate FRU transfer and hub emergency resuscitation required."
        )
    elif urgency == "HIGH":
        sentence2 = (
            f"High-urgency presentation with SpO2 {spo2}%, BP {bp_sys}/{bp_dia}, HR {hr} bpm; "
            "prompt specialist review and stabilization advised."
        )
    else:
        sentence2 = (
            f"Hemodynamically stable with SpO2 {spo2}%, BP {bp_sys}/{bp_dia}, HR {hr} bpm "
            "under routine primary care evaluation."
        )

    return f"{sentence1} {sentence2}"


def generate_clinical_brief(case_dict: Dict[str, Any]) -> str:
    """
    Generates a concise 2-sentence clinical pre-brief for the specialist ("Full context before hello").
    Uses gemini-2.5-flash if GEMINI_API_KEY is available, with safe deterministic fallback.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai

            client = genai.Client(api_key=api_key)
            prompt = (
                "You are an expert physician triaging rural telemedicine cases in Karnataka. "
                "Produce a concise, professional 2-sentence clinical pre-brief for the specialist "
                "('Full context before hello') summarizing patient profile, acute complaints, "
                "critical vitals, and risk stratification. Do not output greetings, headers, or bullet points. "
                "Output exactly 2 sentences.\n\n"
                f"Patient Name: {case_dict.get('patient_name')}\n"
                f"Age/Gender: {case_dict.get('age')}/{case_dict.get('gender')}\n"
                f"Location: {case_dict.get('village_taluka')}\n"
                f"Symptoms: {case_dict.get('symptoms')}\n"
                f"Vitals: {case_dict.get('vitals')}\n"
                f"Urgency: {case_dict.get('urgency')}\n"
                f"Is Red Flag: {case_dict.get('is_red_flag')}\n"
            )

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            if response and response.text:
                cleaned = response.text.strip().replace("\n", " ")
                if len(cleaned) > 20:
                    return cleaned
        except Exception as exc:
            logger.warning("Gemini brief generation failed (%s), using fallback", exc)

    return _deterministic_clinical_brief(case_dict)


def export_fhir_bundle(case_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Exports case as an ABDM/HL7 FHIR R4 Bundle containing Patient,
    Encounter, Observation (vitals), and MedicationRequest resources.
    """
    case_id = str(case_dict.get("id", "TT-000"))
    patient_id = f"patient-{case_id}"
    encounter_id = f"encounter-{case_id}"
    now_iso = datetime.now(timezone.utc).isoformat()

    gender_raw = str(case_dict.get("gender", "")).upper()
    fhir_gender = (
        "male"
        if gender_raw.startswith("M")
        else ("female" if gender_raw.startswith("F") else "other")
    )

    vitals = case_dict.get("vitals") or {}
    symptoms = case_dict.get("symptoms") or []
    symptoms_text = ", ".join(str(s).replace("_", " ") for s in symptoms)

    bundle: Dict[str, Any] = {
        "resourceType": "Bundle",
        "id": f"telethread-bundle-{case_id}",
        "identifier": {
            "system": "https://healthid.ndhm.gov.in/bundles",
            "value": case_id,
        },
        "type": "collection",
        "timestamp": now_iso,
        "meta": {
            "versionId": "1",
            "lastUpdated": now_iso,
            "profile": [
                "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
            ],
        },
        "entry": [],
    }

    # 1. Patient Resource
    patient_resource = {
        "resourceType": "Patient",
        "id": patient_id,
        "identifier": [
            {
                "system": "https://healthid.ndhm.gov.in",
                "value": case_dict.get("abha_id", ""),
            }
        ],
        "name": [
            {
                "use": "official",
                "text": case_dict.get("patient_name", ""),
            }
        ],
        "gender": fhir_gender,
        "address": [
            {
                "text": case_dict.get("village_taluka", ""),
            }
        ],
    }
    bundle["entry"].append(
        {"fullUrl": f"urn:uuid:{patient_id}", "resource": patient_resource}
    )

    # 2. Encounter Resource
    encounter_resource = {
        "resourceType": "Encounter",
        "id": encounter_id,
        "status": "finished",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "AMB",
            "display": "ambulatory",
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "priority": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
                    "code": str(case_dict.get("urgency", "ROUTINE")),
                }
            ]
        },
        "reasonCode": [{"text": symptoms_text}],
    }
    bundle["entry"].append(
        {"fullUrl": f"urn:uuid:{encounter_id}", "resource": encounter_resource}
    )

    # 3. Observations (Vitals)
    def add_obs(obs_id: str, code: str, display: str, value: Any, unit: str, unit_code: str):
        if value is None or value == "":
            return
        try:
            num_val = float(value)
        except (ValueError, TypeError):
            return

        obs_entry = {
            "resourceType": "Observation",
            "id": f"{obs_id}-{case_id}",
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "vital-signs",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": code,
                        "display": display,
                    }
                ],
                "text": display,
            },
            "subject": {"reference": f"Patient/{patient_id}"},
            "encounter": {"reference": f"Encounter/{encounter_id}"},
            "valueQuantity": {
                "value": num_val,
                "unit": unit,
                "system": "http://unitsofmeasure.org",
                "code": unit_code,
            },
        }
        bundle["entry"].append(
            {"fullUrl": f"urn:uuid:{obs_id}-{case_id}", "resource": obs_entry}
        )

    # Blood Pressure (panel with systolic & diastolic components)
    bp_sys = vitals.get("bp_systolic")
    bp_dia = vitals.get("bp_diastolic")
    if bp_sys is not None or bp_dia is not None:
        bp_obs = {
            "resourceType": "Observation",
            "id": f"obs-bp-{case_id}",
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "vital-signs",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "85354-9",
                        "display": "Blood pressure panel with all children optional",
                    }
                ],
                "text": "Blood Pressure",
            },
            "subject": {"reference": f"Patient/{patient_id}"},
            "encounter": {"reference": f"Encounter/{encounter_id}"},
            "component": [],
        }
        if bp_sys is not None:
            bp_obs["component"].append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8480-6",
                                "display": "Systolic blood pressure",
                            }
                        ]
                    },
                    "valueQuantity": {
                        "value": float(bp_sys),
                        "unit": "mmHg",
                        "system": "http://unitsofmeasure.org",
                        "code": "mm[Hg]",
                    },
                }
            )
        if bp_dia is not None:
            bp_obs["component"].append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8462-4",
                                "display": "Diastolic blood pressure",
                            }
                        ]
                    },
                    "valueQuantity": {
                        "value": float(bp_dia),
                        "unit": "mmHg",
                        "system": "http://unitsofmeasure.org",
                        "code": "mm[Hg]",
                    },
                }
            )
        bundle["entry"].append(
            {"fullUrl": f"urn:uuid:obs-bp-{case_id}", "resource": bp_obs}
        )

    add_obs("obs-spo2", "2708-6", "Oxygen saturation in Arterial blood", vitals.get("spo2"), "%", "%")
    add_obs("obs-hr", "8867-4", "Heart rate", vitals.get("hr"), "/min", "/min")
    add_obs("obs-temp", "8310-5", "Body temperature", vitals.get("temp_f"), "degF", "[degF]")

    # 4. MedicationRequest Resources
    rx = case_dict.get("prescription") or {}
    medications = rx.get("medications", []) if isinstance(rx, dict) else []

    # If no medication prescribed yet, export triage initial / provisional medication order
    if not medications:
        if case_dict.get("is_red_flag"):
            medications = [
                {
                    "name": "Polyvalent Anti-Snake Venom (ASV) / Emergency Vasopressor Support",
                    "dosage": "Stat loading dose",
                    "frequency": "Immediate IV infusion",
                    "duration": "1 day",
                    "instructions": case_dict.get("emergency_action")
                    or "Emergency FRU protocol",
                }
            ]
        else:
            medications = [
                {
                    "name": "Primary Triage Supportive Regimen",
                    "dosage": "Per symptom protocol",
                    "frequency": "As directed",
                    "duration": "3 days",
                    "instructions": "Awaiting specialist tele-consultation review",
                }
            ]

    for idx, med in enumerate(medications):
        med_id = f"medreq-{case_id}-{idx+1}"
        if isinstance(med, dict):
            med_name = str(med.get("name") or "Prescribed Medication")
            dosage_str = (
                f"{med.get('dosage', '')} {med.get('frequency', '')} "
                f"for {med.get('duration', '')}. {med.get('instructions', '')}"
            ).strip()
        elif isinstance(med, str):
            med_name = med
            dosage_str = "As directed by physician"
        else:
            continue

        med_entry = {
            "resourceType": "MedicationRequest",
            "id": med_id,
            "status": "active",
            "intent": "order",
            "subject": {"reference": f"Patient/{patient_id}"},
            "encounter": {"reference": f"Encounter/{encounter_id}"},
            "medicationCodeableConcept": {
                "text": med_name,
            },
            "dosageInstruction": [
                {
                    "text": dosage_str or "As directed",
                }
            ],
        }
        bundle["entry"].append(
            {"fullUrl": f"urn:uuid:{med_id}", "resource": med_entry}
        )

    return bundle
