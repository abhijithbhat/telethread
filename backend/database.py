import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./telethread.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initializes database tables and seeds demo cases if empty."""
    from .models import Case

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing_count = db.query(Case).count()
        if existing_count == 0:
            seed_cases = [
                Case(
                    id="TT-101",
                    patient_name="Ramesh Gowda",
                    age=54,
                    gender="M",
                    abha_id="91-2345-6789-0123",
                    consent_given=True,
                    village_taluka="Sullia PHC",
                    symptoms=["snakebite_trauma", "chest_pain", "sweating"],
                    vitals={
                        "bp_systolic": 185,
                        "bp_diastolic": 110,
                        "spo2": 89,
                        "temp_f": 99.1,
                        "hr": 112,
                    },
                    is_red_flag=True,
                    emergency_action="RED FLAG EMERGENCY: Alert Hub immediately, advise 108 / 112 ambulance, and refer to nearest First Referral Unit (FRU).",
                    specialty="Emergency / General Medicine",
                    urgency="CRITICAL",
                    current_tier=1,
                    ai_clinical_brief="54M from Sullia PHC with acute chest pain & suspected viper bite, SpO2 89%, BP 185/110. Critical red flag requiring urgent ASV and FRU transfer.",
                    timeline=[
                        {
                            "timestamp": "10:15:02",
                            "type": "TRIAGE",
                            "content": "Critical case registered at Sullia PHC",
                            "tier": 1,
                        },
                        {
                            "timestamp": "10:16:10",
                            "type": "PHOTO",
                            "url": "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
                            "tier": 3,
                        },
                        {
                            "timestamp": "10:17:00",
                            "type": "VOICE_NOTE",
                            "transcript": "Patient bitten in arecanut plantation; acute chest heaviness, diaphoresis.",
                            "tier": 4,
                        },
                    ],
                    prescription=None,
                ),
                Case(
                    id="TT-102",
                    patient_name="Sumathi Poojary",
                    age=38,
                    gender="F",
                    abha_id="91-8765-4321-0987",
                    consent_given=True,
                    village_taluka="Beltangady PHC",
                    symptoms=["skin_lesion", "itching", "rash"],
                    vitals={
                        "bp_systolic": 118,
                        "bp_diastolic": 76,
                        "spo2": 98,
                        "temp_f": 98.4,
                        "hr": 74,
                    },
                    is_red_flag=False,
                    emergency_action=None,
                    specialty="Dermatology",
                    urgency="ROUTINE",
                    current_tier=1,
                    ai_clinical_brief="38F from Beltangady PHC presenting with itchy annular erythematous fungal rash on flexural areas for 2 weeks. Vitals stable.",
                    timeline=[
                        {
                            "timestamp": "09:30:15",
                            "type": "TRIAGE",
                            "content": "Routine Dermatology consult requested at Beltangady PHC",
                            "tier": 1,
                        },
                        {
                            "timestamp": "09:31:00",
                            "type": "PHOTO",
                            "url": "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
                            "tier": 3,
                        },
                    ],
                    prescription=None,
                ),
            ]
            db.add_all(seed_cases)
            db.commit()
    finally:
        db.close()
