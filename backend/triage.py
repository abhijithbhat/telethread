from typing import Any, Dict, List, Optional


def evaluate_triage(symptoms: List[str], vitals: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic clinical triage engine for TeleThread spoke-hub network.
    Evaluates vital thresholds and red-flag symptom markers to assign
    is_red_flag, urgency, clinical specialty, and immediate emergency actions.
    """
    normalized_symptoms = []
    symptom_tokens = set()

    for s in symptoms or []:
        if isinstance(s, str):
            clean = s.strip().lower()
            normalized_symptoms.append(clean)
            symptom_tokens.add(clean)
            symptom_tokens.add(clean.replace(" ", "_"))
            symptom_tokens.add(clean.replace("-", "_"))

    def get_vital(key: str) -> Optional[float]:
        if not vitals or not isinstance(vitals, dict):
            return None
        val = vitals.get(key)
        if val is None or val == "":
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    spo2 = get_vital("spo2")
    bp_systolic = get_vital("bp_systolic")
    bp_diastolic = get_vital("bp_diastolic")
    hr = get_vital("hr")
    temp_f = get_vital("temp_f")

    # 1. Red-flag rules
    is_red_flag = False

    # Vitals-based red flags
    # NOTE: SpO2 < 92% is configured as current application policy for red-flag hypoxia,
    # pending formal clinical review and sign-off before real-world clinical use.
    if spo2 is not None and spo2 < 92:
        is_red_flag = True
    elif bp_systolic is not None and (bp_systolic >= 180 or bp_systolic < 90):
        is_red_flag = True

    # Symptom-based red flags
    red_flag_symptoms = {
        "chest_pain",
        "chest pain",
        "snakebite_trauma",
        "snakebite",
        "snake_bite",
        "unconscious",
        "unconsciousness",
        "syncope",
        "altered_sensorium",
    }
    if not is_red_flag:
        for rf in red_flag_symptoms:
            if rf in symptom_tokens:
                is_red_flag = True
                break
        if not is_red_flag:
            for s in normalized_symptoms:
                if any(rf in s for rf in ["chest pain", "chest_pain", "snakebite", "unconscious"]):
                    is_red_flag = True
                    break

    if is_red_flag:
        # Reconcile specialty label with SHARED_CONTRACT.md:
        # Red-flag cases with cardiac symptoms map to "Cardiology / Emergency".
        # Non-cardiac emergencies (e.g. snakebite, altered sensorium) retain "Emergency / General Medicine".
        cardiac_symptoms = {
            "chest_pain",
            "chest pain",
            "angina",
            "myocardial",
            "heart_attack",
            "cardiac",
        }
        has_cardiac_symptom = any(cs in symptom_tokens for cs in cardiac_symptoms) or any(
            any(cs in s for cs in ["chest pain", "chest_pain", "angina", "myocardial"])
            for s in normalized_symptoms
        )
        red_flag_specialty = (
            "Cardiology / Emergency"
            if has_cardiac_symptom
            else "Emergency / General Medicine"
        )

        return {
            "is_red_flag": True,
            "urgency": "CRITICAL",
            "specialty": red_flag_specialty,
            "emergency_action": (
                "RED FLAG EMERGENCY: Alert Hub immediately, advise 108 / 112 ambulance, "
                "and refer to nearest First Referral Unit (FRU)."
            ),
        }

    # 2. Specialty routing by symptom keywords
    pediatrics_keywords = [
        "pediatric",
        "child",
        "infant",
        "baby",
        "toddler",
        "neonate",
        "neonatal",
        "growth",
        "vaccination",
        "pediatrics",
    ]
    obgyn_keywords = [
        "pregnancy",
        "pregnant",
        "antenatal",
        "prenatal",
        "menstrual",
        "bleeding_vaginal",
        "vaginal_bleeding",
        "labor",
        "uterine",
        "gyn",
        "obgyn",
        "obstetric",
        "pelvic_pain",
        "amenorrhea",
    ]
    dermatology_keywords = [
        "skin",
        "rash",
        "itching",
        "lesion",
        "skin_lesion",
        "eczema",
        "fungal",
        "dermatitis",
        "acne",
        "psoriasis",
        "pruritus",
        "scabies",
        "ringworm",
        "dermatology",
        "urticaria",
    ]

    def matches_specialty(keywords: List[str]) -> bool:
        for s in normalized_symptoms:
            if any(k in s for k in keywords):
                return True
        for token in symptom_tokens:
            if any(k in token for k in keywords):
                return True
        return False

    if matches_specialty(obgyn_keywords):
        specialty = "OB-GYN"
    elif matches_specialty(pediatrics_keywords):
        specialty = "Pediatrics"
    elif matches_specialty(dermatology_keywords):
        specialty = "Dermatology"
    else:
        specialty = "General Medicine"

    # 3. Urgency determination: HIGH vs ROUTINE
    is_high_urgency = False

    # Moderately abnormal vitals
    if spo2 is not None and 92 <= spo2 < 95:
        is_high_urgency = True
    elif bp_systolic is not None and (140 <= bp_systolic < 180):
        is_high_urgency = True
    elif bp_diastolic is not None and (bp_diastolic >= 95 or bp_diastolic < 60):
        is_high_urgency = True
    elif hr is not None and (hr >= 115 or hr < 50):
        is_high_urgency = True
    elif temp_f is not None and temp_f >= 101.5:
        is_high_urgency = True

    # Acute distress symptoms
    high_urgency_keywords = [
        "high_fever",
        "severe_pain",
        "acute_pain",
        "breathlessness",
        "difficulty_breathing",
        "dyspnea",
        "severe_vomiting",
        "persistent_vomiting",
        "dehydration",
        "severe_diarrhea",
        "hematuria",
        "acute_abdomen",
        "abdominal_pain",
    ]
    if not is_high_urgency:
        for s in normalized_symptoms:
            if any(k in s for k in high_urgency_keywords):
                is_high_urgency = True
                break

    urgency = "HIGH" if is_high_urgency else "ROUTINE"

    return {
        "is_red_flag": False,
        "urgency": urgency,
        "specialty": specialty,
        "emergency_action": None,
    }
