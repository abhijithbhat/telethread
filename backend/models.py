from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, Text

from .database import Base


class Case(Base):
    __tablename__ = "cases"

    id = Column(String, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    abha_id = Column(String, nullable=False)
    consent_given = Column(Boolean, default=True, nullable=False)
    village_taluka = Column(String, nullable=False)
    symptoms = Column(JSON, default=list, nullable=False)
    vitals = Column(JSON, default=dict, nullable=False)
    is_red_flag = Column(Boolean, default=False, nullable=False)
    emergency_action = Column(String, nullable=True)
    specialty = Column(String, nullable=False)
    urgency = Column(String, nullable=False)
    current_tier = Column(Integer, default=1, nullable=False)
    ai_clinical_brief = Column(Text, nullable=True)
    timeline = Column(JSON, default=list, nullable=False)
    prescription = Column(JSON, nullable=True)
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_name": self.patient_name,
            "age": self.age,
            "gender": self.gender,
            "abha_id": self.abha_id,
            "consent_given": bool(self.consent_given),
            "village_taluka": self.village_taluka,
            "symptoms": self.symptoms if isinstance(self.symptoms, list) else [],
            "vitals": self.vitals if isinstance(self.vitals, dict) else {},
            "is_red_flag": bool(self.is_red_flag),
            "emergency_action": self.emergency_action,
            "specialty": self.specialty,
            "urgency": self.urgency,
            "current_tier": self.current_tier,
            "ai_clinical_brief": self.ai_clinical_brief,
            "timeline": self.timeline if isinstance(self.timeline, list) else [],
            "prescription": self.prescription,
        }
