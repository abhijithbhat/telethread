from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

try:
    from .ai_helper import export_fhir_bundle, generate_clinical_brief
    from .database import get_db, init_db
    from .models import Case
    from .pdf_rx import format_sms_rx, generate_prescription_pdf
    from .triage import evaluate_triage
except ImportError:
    from ai_helper import export_fhir_bundle, generate_clinical_brief
    from database import get_db, init_db
    from models import Case
    from pdf_rx import format_sms_rx, generate_prescription_pdf
    from triage import evaluate_triage

router = APIRouter(prefix="/api/cases", tags=["cases"])

# Initialize tables and seed cases immediately
init_db()


class CaseCreateRequest(BaseModel):
    id: Optional[str] = None
    patient_name: str
    age: int
    gender: str
    abha_id: Optional[str] = None
    consent_given: bool = True
    village_taluka: str
    symptoms: List[str] = Field(default_factory=list)
    vitals: Dict[str, Any] = Field(default_factory=dict)
    current_tier: int = 1
    timeline: Optional[List[Dict[str, Any]]] = None
    prescription: Optional[Dict[str, Any]] = None


class SyncOutboxItem(BaseModel):
    type: str = "SYNC"
    content: Optional[str] = None
    url: Optional[str] = None
    transcript: Optional[str] = None
    vitals: Optional[Dict[str, Any]] = None
    tier: int = 4
    timestamp: Optional[str] = None


class PrescriptionRequest(BaseModel):
    diagnosis: Optional[str] = None
    medications: List[Dict[str, Any]] = Field(default_factory=list)
    advice: Optional[str] = None
    follow_up: Optional[str] = None
    doctor_name: Optional[str] = "Dr. K. Srinivas, MD"
    doctor_reg: Optional[str] = "KMC-78452"


class TierUpdateRequest(BaseModel):
    current_tier: int = Field(..., ge=1, le=4, description="Target network tier (1-4)")
    reason: Optional[str] = Field(None, description="Reason for tier adaptation")


def _urgency_sort_key(case: Case):
    red_flag_score = 0 if case.is_red_flag else 1
    urgency_map = {"CRITICAL": 0, "HIGH": 1, "ROUTINE": 2}
    urg_score = urgency_map.get(str(case.urgency).upper(), 3)
    created_ts = case.created_at.timestamp() if case.created_at else 0
    return (red_flag_score, urg_score, -created_ts)


@router.get("", response_model=List[Dict[str, Any]])
def list_cases(db: Session = Depends(get_db)):
    """
    Returns cases sorted with is_red_flag == True first, then HIGH, then ROUTINE.
    """
    cases = db.query(Case).all()
    sorted_cases = sorted(cases, key=_urgency_sort_key)
    return [c.to_dict() for c in sorted_cases]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreateRequest, db: Session = Depends(get_db)):
    """
    Creates a new case, runs evaluate_triage, runs generate_clinical_brief,
    saves to SQLite, and returns the case object.
    """
    # 1. Deterministic triage
    triage_result = evaluate_triage(payload.symptoms, payload.vitals)

    # 2. Determine or generate unique Case ID
    case_id = payload.id
    if not case_id:
        count = db.query(Case).count()
        candidate = f"TT-{101 + count}"
        idx = count + 1
        while db.query(Case).filter(Case.id == candidate).first():
            idx += 1
            candidate = f"TT-{100 + idx}"
        case_id = candidate

    # 3. Default timeline if not provided
    timeline = payload.timeline
    if not timeline:
        timeline = [
            {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "type": "TRIAGE",
                "content": f"Case registered at {payload.village_taluka}",
                "tier": payload.current_tier,
            }
        ]

    # 4. Generate AI clinical brief
    temp_case_dict = {
        "id": case_id,
        "patient_name": payload.patient_name,
        "age": payload.age,
        "gender": payload.gender,
        "abha_id": payload.abha_id or f"91-{datetime.now().strftime('%Y%m%d')}-{case_id}",
        "consent_given": payload.consent_given,
        "village_taluka": payload.village_taluka,
        "symptoms": payload.symptoms,
        "vitals": payload.vitals,
        "is_red_flag": triage_result["is_red_flag"],
        "emergency_action": triage_result["emergency_action"],
        "specialty": triage_result["specialty"],
        "urgency": triage_result["urgency"],
        "current_tier": payload.current_tier,
        "timeline": timeline,
        "prescription": payload.prescription,
    }
    clinical_brief = generate_clinical_brief(temp_case_dict)

    # 5. Save to database
    new_case = Case(
        id=case_id,
        patient_name=payload.patient_name,
        age=payload.age,
        gender=payload.gender,
        abha_id=temp_case_dict["abha_id"],
        consent_given=payload.consent_given,
        village_taluka=payload.village_taluka,
        symptoms=payload.symptoms,
        vitals=payload.vitals,
        is_red_flag=triage_result["is_red_flag"],
        emergency_action=triage_result["emergency_action"],
        specialty=triage_result["specialty"],
        urgency=triage_result["urgency"],
        current_tier=payload.current_tier,
        ai_clinical_brief=clinical_brief,
        timeline=timeline,
        prescription=payload.prescription,
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)
    return new_case.to_dict()


@router.get("/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db)):
    """Returns single case matching case_id."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found",
        )
    return case.to_dict()


@router.patch("/{case_id}/tier")
def update_case_tier(
    case_id: str,
    payload: TierUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    Updates case.current_tier, appends a tier-transition event to timeline,
    calls flag_modified, and commits to SQLite.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found",
        )

    old_tier = case.current_tier
    case.current_tier = payload.current_tier

    timeline_entry = {
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "type": "TIER_CHANGE",
        "content": payload.reason or f"Network channel adapted from Tier {old_tier} to Tier {payload.current_tier}",
        "tier": payload.current_tier,
    }
    current_timeline = list(case.timeline or [])
    current_timeline.append(timeline_entry)
    case.timeline = current_timeline
    flag_modified(case, "timeline")

    db.commit()
    db.refresh(case)
    return case.to_dict()


@router.post("/{case_id}/sync-outbox")
def sync_outbox(
    case_id: str,
    payload: Union[SyncOutboxItem, List[SyncOutboxItem], Dict[str, Any]],
    db: Session = Depends(get_db),
):
    """
    Accepts Tier 4 queued items { type, content, url, transcript, vitals, tier }
    and appends them to the case timeline without restarting the case.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found",
        )

    # Normalize incoming items
    raw_items = []
    if isinstance(payload, list):
        raw_items = [p.dict() if hasattr(p, "dict") else p for p in payload]
    elif isinstance(payload, SyncOutboxItem):
        raw_items = [payload.dict()]
    elif isinstance(payload, dict):
        if "items" in payload and isinstance(payload["items"], list):
            raw_items = payload["items"]
        else:
            raw_items = [payload]

    current_timeline = list(case.timeline or [])
    current_vitals = dict(case.vitals or {})

    for item in raw_items:
        entry = {
            "timestamp": item.get("timestamp") or datetime.now().strftime("%H:%M:%S"),
            "type": item.get("type", "SYNC"),
            "tier": item.get("tier", 4),
        }
        if item.get("content") is not None:
            entry["content"] = item["content"]
        if item.get("url") is not None:
            entry["url"] = item["url"]
        if item.get("transcript") is not None:
            entry["transcript"] = item["transcript"]

        current_timeline.append(entry)

        # Update vitals if bundled in outbox item
        item_vitals = item.get("vitals")
        if item_vitals and isinstance(item_vitals, dict):
            current_vitals.update(item_vitals)

        if "tier" in item and item["tier"] is not None:
            case.current_tier = item["tier"]

    case.timeline = current_timeline
    flag_modified(case, "timeline")

    if current_vitals != case.vitals:
        case.vitals = current_vitals
        flag_modified(case, "vitals")
        # Re-evaluate triage if vitals updated
        triage_res = evaluate_triage(case.symptoms, case.vitals)
        if triage_res["is_red_flag"] and not case.is_red_flag:
            case.is_red_flag = True
            case.urgency = "CRITICAL"
            case.emergency_action = triage_res["emergency_action"]
            case.specialty = triage_res["specialty"]

    db.commit()
    db.refresh(case)
    return case.to_dict()


@router.post("/{case_id}/prescribe")
def prescribe_case(
    case_id: str,
    payload: PrescriptionRequest,
    db: Session = Depends(get_db),
):
    """
    Saves prescription, appends to timeline, and returns
    { case, sms_preview, pdf_url: '/api/cases/{case_id}/prescription.pdf' }.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found",
        )

    rx_dict = payload.dict()
    case.prescription = rx_dict
    flag_modified(case, "prescription")

    doctor = rx_dict.get("doctor_name") or "Specialist Physician"
    timeline_entry = {
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "type": "PRESCRIPTION",
        "content": f"e-Prescription issued by {doctor}",
        "tier": 1,
    }
    current_timeline = list(case.timeline or [])
    current_timeline.append(timeline_entry)
    case.timeline = current_timeline
    flag_modified(case, "timeline")

    db.commit()
    db.refresh(case)

    case_dict = case.to_dict()
    sms_text = format_sms_rx(case_dict, rx_dict)

    return {
        "case": case_dict,
        "sms_preview": sms_text,
        "pdf_url": f"/api/cases/{case_id}/prescription.pdf",
    }


@router.get("/{case_id}/prescription.pdf")
def get_prescription_pdf(case_id: str, db: Session = Depends(get_db)):
    """Streams the generated PDF e-Prescription."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found",
        )

    pdf_stream = generate_prescription_pdf(case.to_dict(), case.prescription)
    return Response(
        content=pdf_stream.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=prescription_{case_id}.pdf"
        },
    )


@router.get("/{case_id}/fhir")
def get_fhir_bundle(case_id: str, db: Session = Depends(get_db)):
    """Returns the ABDM/HL7 FHIR R4 Bundle JSON."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found",
        )

    return export_fhir_bundle(case.to_dict())
