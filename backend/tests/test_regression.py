"""
Comprehensive Regression Test Suite for TeleThread Backend
Covers:
- FIX 1: Hub E-Prescription schema, medication persistence, PDF generation & text extraction
- FIX 3: SpO2 triage boundary values (89, 90, 91, 92) and Systolic BP (179, 180)
- FIX 4: Specialty contract consistency (cardiac vs non-cardiac emergency vs routine)
- FIX 5: ABDM FHIR R4 bundle resource types, entries, and internal reference integrity
- Deterministic errors: Missing cases (404), invalid requests
- Isolated test database: Uses in-memory SQLite, never touches live case database
- SMS Note: Verification of bilingual SMS formatting and length limits
"""

import io
import pytest
from datetime import datetime, timezone
import PyPDF2
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.main import app
from backend.database import Base, get_db
from backend.models import Case
from backend.triage import evaluate_triage
from backend.pdf_rx import format_sms_rx, generate_prescription_pdf
from backend.ai_helper import export_fhir_bundle


# ==============================================================================
# Isolated Test Database & Test Fixtures
# ==============================================================================

TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine
)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session():
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ==============================================================================
# 1. FIX 3: Triage Boundary Value Tests
# ==============================================================================


def test_triage_spo2_boundary_89_critical():
    result = evaluate_triage(
        symptoms=["cough"], vitals={"spo2": 89, "bp_systolic": 120}
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"


def test_triage_spo2_boundary_90_critical():
    result = evaluate_triage(
        symptoms=["cough"], vitals={"spo2": 90, "bp_systolic": 120}
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"


def test_triage_spo2_boundary_91_critical():
    """SpO2 91% must evaluate as CRITICAL red-flag under current application policy (<92%)."""
    result = evaluate_triage(
        symptoms=["cough"], vitals={"spo2": 91, "bp_systolic": 120}
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"


def test_triage_spo2_boundary_92_high_urgency():
    """SpO2 92% is NOT a red flag, but is moderately abnormal vitals (HIGH urgency)."""
    result = evaluate_triage(
        symptoms=["cough"], vitals={"spo2": 92, "bp_systolic": 120}
    )
    assert result["is_red_flag"] is False
    assert result["urgency"] == "HIGH"


def test_triage_spo2_boundary_94_high_urgency():
    result = evaluate_triage(
        symptoms=["cough"], vitals={"spo2": 94, "bp_systolic": 120}
    )
    assert result["is_red_flag"] is False
    assert result["urgency"] == "HIGH"


def test_triage_spo2_boundary_95_routine():
    result = evaluate_triage(
        symptoms=["skin_rash"], vitals={"spo2": 95, "bp_systolic": 120}
    )
    assert result["is_red_flag"] is False
    assert result["urgency"] == "ROUTINE"


def test_triage_bp_systolic_boundary_179():
    """Systolic BP 179 mmHg is high urgency (140-179), not yet red flag crisis (>=180)."""
    result = evaluate_triage(
        symptoms=[], vitals={"bp_systolic": 179, "bp_diastolic": 80, "spo2": 98}
    )
    assert result["is_red_flag"] is False
    assert result["urgency"] == "HIGH"


def test_triage_bp_systolic_boundary_180_critical():
    """Systolic BP 180 mmHg triggers hypertensive crisis red flag."""
    result = evaluate_triage(
        symptoms=[], vitals={"bp_systolic": 180, "bp_diastolic": 80, "spo2": 98}
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"


def test_triage_bp_systolic_boundary_89_hypotension():
    """Systolic BP < 90 mmHg triggers shock / hypotension red flag."""
    result = evaluate_triage(
        symptoms=[], vitals={"bp_systolic": 89, "bp_diastolic": 55, "spo2": 98}
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"


# ==============================================================================
# 2. FIX 4: Specialty Contract Consistency Tests
# ==============================================================================


def test_triage_specialty_cardiac_red_flag():
    """Cardiac red flags map to 'Cardiology / Emergency' per SHARED_CONTRACT.md."""
    result = evaluate_triage(
        symptoms=["chest_pain", "sweating"],
        vitals={"bp_systolic": 185, "bp_diastolic": 110, "spo2": 89, "hr": 112},
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"
    assert result["specialty"] == "Cardiology / Emergency"


def test_triage_specialty_non_cardiac_snakebite_emergency():
    """Snakebite emergency must NOT be classified as Cardiology."""
    result = evaluate_triage(
        symptoms=["snakebite_trauma"],
        vitals={"bp_systolic": 130, "bp_diastolic": 85, "spo2": 97},
    )
    assert result["is_red_flag"] is True
    assert result["urgency"] == "CRITICAL"
    assert result["specialty"] == "Emergency / General Medicine"


def test_triage_specialty_non_cardiac_unconscious_emergency():
    """Unconscious / syncope emergency retains Emergency / General Medicine."""
    result = evaluate_triage(
        symptoms=["unconscious"],
        vitals={"bp_systolic": 120, "bp_diastolic": 80, "spo2": 96},
    )
    assert result["is_red_flag"] is True
    assert result["specialty"] == "Emergency / General Medicine"


def test_triage_specialty_routine_specialties():
    """Verifies non-emergency keyword specialty routing."""
    res_derm = evaluate_triage(["skin_rash", "itching"], vitals={"spo2": 99})
    assert res_derm["specialty"] == "Dermatology"
    assert res_derm["urgency"] == "ROUTINE"

    res_obgyn = evaluate_triage(["pregnancy", "antenatal_checkup"], vitals={"spo2": 98})
    assert res_obgyn["specialty"] == "OB-GYN"

    res_peds = evaluate_triage(["pediatric_checkup", "infant"], vitals={"spo2": 98})
    assert res_peds["specialty"] == "Pediatrics"

    res_gen = evaluate_triage(["general_weakness"], vitals={"spo2": 98})
    assert res_gen["specialty"] == "General Medicine"


# ==============================================================================
# 3. FIX 1: Hub E-Prescription Payload, DB Persistence, and PDF Text Extraction
# ==============================================================================


@pytest.fixture
def sample_case(db_session):
    """Inserts an isolated test case into the in-memory database."""
    case = Case(
        id="TT-TEST-001",
        patient_name="Ramesh Gowda",
        age=54,
        gender="M",
        abha_id="91-2345-6789-0123",
        consent_given=True,
        village_taluka="Sullia PHC",
        symptoms=["chest_pain", "sweating"],
        vitals={
            "bp_systolic": 185,
            "bp_diastolic": 110,
            "spo2": 89,
            "temp_f": 99.1,
            "hr": 112,
        },
        is_red_flag=True,
        emergency_action="ALERT HUB: Advise 108 / 112 immediately and refer to nearest FRU.",
        specialty="Cardiology / Emergency",
        urgency="CRITICAL",
        current_tier=1,
        ai_clinical_brief="54M from Sullia PHC with acute chest pain, SpO2 89%, BP 185/110.",
        timeline=[{"timestamp": "10:15:02", "type": "TRIAGE", "content": "Case registered at Spoke"}],
        prescription=None,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(case)
    db_session.commit()
    db_session.refresh(case)
    return case


def test_hub_prescription_submission_persists_medications(client, sample_case, db_session):
    """
    Asserts that:
    1. The Hub request schema with medications array is accepted.
    2. Successful response contains the expected medication entries.
    3. The returned case object contains the intended prescription.
    4. Database query confirms persistence.
    """
    payload = {
        "diagnosis": "Acute Coronary Syndrome (ACS) / STEMI",
        "medications": [
            {
                "name": "Tab Aspirin",
                "dosage": "300mg stat",
            },
            {
                "name": "Tab Clopidogrel",
                "dosage": "300mg stat",
            },
        ],
        "advice": "Strict bed rest. Continuous O2 at 4 L/min.",
        "follow_up": "Immediate emergency transfer to FRU",
        "doctor_name": "Dr. K. Srinivas, MD",
        "doctor_reg": "KMC-78452",
    }

    response = client.post(f"/api/cases/{sample_case.id}/prescribe", json=payload)
    assert response.status_code == 200, response.text

    body = response.json()
    assert "case" in body
    assert "sms_preview" in body
    assert body["pdf_url"] == f"/api/cases/{sample_case.id}/prescription.pdf"

    # Assert returned case contains prescription with medications array
    returned_case = body["case"]
    assert returned_case["prescription"] is not None
    assert returned_case["prescription"]["diagnosis"] == "Acute Coronary Syndrome (ACS) / STEMI"
    assert len(returned_case["prescription"]["medications"]) == 2
    assert returned_case["prescription"]["medications"][0]["name"] == "Tab Aspirin"
    assert returned_case["prescription"]["medications"][0]["dosage"] == "300mg stat"
    assert returned_case["prescription"]["follow_up"] == "Immediate emergency transfer to FRU"
    assert returned_case["prescription"]["doctor_name"] == "Dr. K. Srinivas, MD"
    assert returned_case["prescription"]["doctor_reg"] == "KMC-78452"

    # Assert persisted in database directly
    persisted = db_session.query(Case).filter(Case.id == sample_case.id).first()
    assert persisted is not None
    assert persisted.prescription is not None
    assert len(persisted.prescription["medications"]) == 2
    assert persisted.prescription["medications"][1]["name"] == "Tab Clopidogrel"

    # Verify timeline entry was appended
    timeline = persisted.timeline
    assert any(entry.get("type") == "PRESCRIPTION" for entry in timeline)


def test_generated_pdf_contains_medication_text(client, sample_case):
    """
    Verifies that the generated PDF actually contains the prescribed medication
    names and dosages via PyPDF2 text extraction.
    Does NOT accept HTTP 200 or pdf_url alone as proof.
    """
    # 1. Prescribe medication
    payload = {
        "diagnosis": "Severe Angina Pectoris",
        "medications": [
            {
                "name": "Tab Sorbitrate",
                "dosage": "5mg sublingual",
                "frequency": "SOS",
                "duration": "1 day",
                "instructions": "Place under tongue",
            }
        ],
        "advice": "Monitor blood pressure before sublingual dose",
        "follow_up": "Cardiology OPD review in 2 days",
        "doctor_name": "Dr. Ramesh Rao, MD",
        "doctor_reg": "KMC-99231",
    }
    prescribe_resp = client.post(f"/api/cases/{sample_case.id}/prescribe", json=payload)
    assert prescribe_resp.status_code == 200

    # 2. Fetch PDF
    pdf_resp = client.get(f"/api/cases/{sample_case.id}/prescription.pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content.startswith(b"%PDF")

    # 3. Extract text from PDF using PyPDF2
    pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_resp.content))
    assert len(pdf_reader.pages) >= 1

    extracted_text = ""
    for page in pdf_reader.pages:
        extracted_text += page.extract_text() or ""

    # 4. Assert actual presence of clinical content in the extracted PDF text
    assert "Tab Sorbitrate" in extracted_text, "Medication name must be in the PDF text"
    assert "5mg sublingual" in extracted_text, "Medication dosage must be in the PDF text"
    assert "Severe Angina Pectoris" in extracted_text, "Diagnosis must be in the PDF text"
    assert "Dr. Ramesh Rao, MD" in extracted_text, "Doctor name must be in the PDF text"
    assert "KMC-99231" in extracted_text, "Doctor registration must be in the PDF text"
    assert "Ramesh Gowda" in extracted_text, "Patient name must be in the PDF text"


def test_prescription_missing_optional_fields_safe(client, sample_case):
    """Missing optional fields (e.g. empty medications list or None advice) must be handled safely."""
    minimal_payload = {
        "diagnosis": "Provisional Chest Observation",
        "medications": [],
    }
    resp = client.post(f"/api/cases/{sample_case.id}/prescribe", json=minimal_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["case"]["prescription"]["medications"] == []

    # PDF generation for empty medications must still succeed with default protocol text
    pdf_resp = client.get(f"/api/cases/{sample_case.id}/prescription.pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"


def test_prescription_nonexistent_case_404(client):
    """Submitting prescription to nonexistent case must return deterministic HTTP 404."""
    payload = {
        "diagnosis": "Test",
        "medications": [{"name": "Med A", "dosage": "10mg"}],
    }
    resp = client.post("/api/cases/TT-DOES-NOT-EXIST/prescribe", json=payload)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_pdf_nonexistent_case_404(client):
    """Requesting PDF for nonexistent case must return deterministic HTTP 404."""
    resp = client.get("/api/cases/TT-DOES-NOT-EXIST/prescription.pdf")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ==============================================================================
# 4. FIX 5: ABDM FHIR R4 Bundle Resource Verification
# ==============================================================================


def test_fhir_bundle_resource_types_and_references(client, sample_case):
    """
    Verifies that the generated FHIR Bundle contains standards-compliant
    resource types and valid internal subject/encounter references.
    """
    resp = client.get(f"/api/cases/{sample_case.id}/fhir")
    assert resp.status_code == 200

    bundle = resp.json()
    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "collection"

    entries = bundle.get("entry", [])
    assert len(entries) >= 5, "Bundle must contain patient, encounter, observations, and med requests"

    resource_types = [e["resource"]["resourceType"] for e in entries]
    assert "Patient" in resource_types
    assert "Encounter" in resource_types
    assert "Observation" in resource_types
    assert "MedicationRequest" in resource_types

    # Patient resource verification
    patient_entry = next(e["resource"] for e in entries if e["resource"]["resourceType"] == "Patient")
    expected_patient_id = f"patient-{sample_case.id}"
    assert patient_entry["id"] == expected_patient_id
    assert patient_entry["name"][0]["text"] == sample_case.patient_name

    # Encounter resource verification
    encounter_entry = next(e["resource"] for e in entries if e["resource"]["resourceType"] == "Encounter")
    assert encounter_entry["subject"]["reference"] == f"Patient/{expected_patient_id}"

    # Observation resources verification
    obs_entries = [e["resource"] for e in entries if e["resource"]["resourceType"] == "Observation"]
    for obs in obs_entries:
        assert obs["subject"]["reference"] == f"Patient/{expected_patient_id}"
        assert obs["encounter"]["reference"] == f"Encounter/encounter-{sample_case.id}"
        assert "category" in obs

    # MedicationRequest resources verification
    med_entries = [e["resource"] for e in entries if e["resource"]["resourceType"] == "MedicationRequest"]
    for med in med_entries:
        assert med["subject"]["reference"] == f"Patient/{expected_patient_id}"
        assert med["encounter"]["reference"] == f"Encounter/encounter-{sample_case.id}"
        assert "medicationCodeableConcept" in med


# ==============================================================================
# 5. SMS Formatter Verification
# ==============================================================================


def test_bilingual_sms_formatter():
    """
    Verifies format_sms_rx produces a valid bilingual message containing patient name,
    medications, and Kannada instructions within the 159-character length guard.
    """
    case_dict = {
        "patient_name": "Ramesh Gowda",
        "prescription": {
            "medications": [
                {"name": "Aspirin", "dosage": "300mg"},
                {"name": "Clopidogrel", "dosage": "300mg"},
            ],
            "follow_up": "FRU Puttur",
        },
    }
    sms = format_sms_rx(case_dict)
    assert len(sms) <= 159
    assert "Ramesh" in sms
    assert "Aspirin 300mg" in sms
    assert "ಮಾತ್ರೆ ಸರಿಯಾಗಿ ಸೇವಿಸಿ" in sms
    assert "108" in sms
