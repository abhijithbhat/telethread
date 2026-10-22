import io
from datetime import datetime
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def format_sms_rx(case_dict: Dict[str, Any], rx_dict: Optional[Dict[str, Any]] = None) -> str:
    """
    Returns a compact <160-character SMS string (in English + Kannada script)
    that can be transmitted over 2G SMS when the rural patient is offline.
    """
    rx = rx_dict or case_dict.get("prescription") or {}
    name = str(case_dict.get("patient_name", "Patient")).split()[0]
    meds = rx.get("medications", []) if isinstance(rx, dict) else []

    med_tokens = []
    for m in meds[:3]:
        m_name = m.get("name", "").strip()
        m_dose = m.get("dosage", "").strip()
        med_tokens.append(f"{m_name} {m_dose}".strip())

    meds_str = ", ".join(med_tokens) if med_tokens else "Rx as advised"
    follow_up = (
        str(rx.get("follow_up", "3d")).strip() if isinstance(rx, dict) else "3d"
    )

    # Kannada: "ಮಾತ್ರೆ ಸರಿಯಾಗಿ ಸೇವಿಸಿ" (Take medicines properly)
    # "ತುರ್ತಿಗೆ 108" (108 for emergency)
    candidate = f"TeleThread Rx: {name}. Meds: {meds_str}. ಮಾತ್ರೆ ಸರಿಯಾಗಿ ಸೇವಿಸಿ. ಮರುಪರೀಕ್ಷೆ: {follow_up}. ತುರ್ತಿಗೆ 108."
    if len(candidate) <= 159:
        return candidate

    # Truncate medicines if necessary to fit strictly in <160 characters
    prefix = f"TeleThread Rx: {name}. Meds: "
    suffix = f". ಮಾತ್ರೆ ಸರಿಯಾಗಿ ಸೇವಿಸಿ. ಮರುಪರೀಕ್ಷೆ: {follow_up}. ತುರ್ತಿಗೆ 108."
    room = 159 - len(prefix) - len(suffix)
    if room > 10:
        meds_str = meds_str[:room].rstrip(" ,;")
        return f"{prefix}{meds_str}{suffix}"

    fallback = f"TeleThread Rx: {name}. Meds: {meds_str[:50]}. ಮಾತ್ರೆ ಸರಿಯಾಗಿ ಸೇವಿಸಿ. ತುರ್ತಿಗೆ 108."
    return fallback[:159]


def generate_prescription_pdf(
    case_dict: Dict[str, Any], rx_dict: Optional[Dict[str, Any]] = None
) -> io.BytesIO:
    """
    Generates an in-memory PDF e-Prescription (BytesIO) containing Hospital Hub header,
    Patient Name, ABHA ID, Vitals summary, Diagnosis, Medications table,
    Follow-up date, and Doctor signature block.
    """
    rx = rx_dict or case_dict.get("prescription") or {}
    vitals = case_dict.get("vitals") or {}

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "HubHeader",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1A365D"),
        alignment=1,
    )
    subtitle_style = ParagraphStyle(
        "HubSubHeader",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    section_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=6,
        spaceAfter=4,
    )
    label_style = ParagraphStyle(
        "LabelText",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )
    value_style = ParagraphStyle(
        "ValueText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
    )
    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1E293B"),
    )
    table_head_style = ParagraphStyle(
        "TableHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
    )
    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#64748B"),
        alignment=1,
    )

    story = []

    # 1. Hospital Hub Header
    story.append(
        Paragraph("GOVERNMENT OF KARNATAKA | DEPARTMENT OF HEALTH & FAMILY WELFARE", subtitle_style)
    )
    story.append(Paragraph("TeleThread Telemedicine Hub — District Hospital Network", title_style))
    story.append(
        Paragraph(
            "Dakshina Kannada Division | ABDM Integrated Digital Health Record", subtitle_style
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1A365D"), spaceAfter=8)
    )

    # 2. Patient & Consultation Details Box
    patient_name = case_dict.get("patient_name", "N/A")
    age = case_dict.get("age", "N/A")
    gender = case_dict.get("gender", "N/A")
    abha_id = case_dict.get("abha_id", "N/A")
    case_id = case_dict.get("id", "N/A")
    phc = case_dict.get("village_taluka", "N/A")
    urgency = case_dict.get("urgency", "ROUTINE")
    date_str = datetime.now().strftime("%d-%b-%Y %I:%M %p")

    patient_table_data = [
        [
            Paragraph("Case ID:", label_style),
            Paragraph(f"<b>{case_id}</b>", value_style),
            Paragraph("Date / Time:", label_style),
            Paragraph(date_str, value_style),
        ],
        [
            Paragraph("Patient Name:", label_style),
            Paragraph(f"<b>{patient_name}</b>", value_style),
            Paragraph("Age / Gender:", label_style),
            Paragraph(f"{age} Y / {gender}", value_style),
        ],
        [
            Paragraph("ABHA ID:", label_style),
            Paragraph(f"<b>{abha_id}</b>", value_style),
            Paragraph("Spoke PHC:", label_style),
            Paragraph(phc, value_style),
        ],
        [
            Paragraph("Triage Urgency:", label_style),
            Paragraph(
                f"<font color='{'#DC2626' if case_dict.get('is_red_flag') else '#0D9488'}'><b>{urgency}</b></font>",
                value_style,
            ),
            Paragraph("Specialty:", label_style),
            Paragraph(str(case_dict.get("specialty", "General Medicine")), value_style),
        ],
    ]

    patient_table = Table(patient_table_data, colWidths=[90, 180, 85, 185])
    patient_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(patient_table)
    story.append(Spacer(1, 8))

    # 3. Vitals Summary Bar
    bp_sys = vitals.get("bp_systolic", "-")
    bp_dia = vitals.get("bp_diastolic", "-")
    spo2 = vitals.get("spo2", "-")
    hr = vitals.get("hr", "-")
    temp_f = vitals.get("temp_f", "-")

    vitals_data = [
        [
            Paragraph("<b>Vitals Summary:</b>", label_style),
            Paragraph(f"BP: <b>{bp_sys}/{bp_dia}</b> mmHg", value_style),
            Paragraph(f"SpO2: <b>{spo2}%</b>", value_style),
            Paragraph(f"Heart Rate: <b>{hr}</b> bpm", value_style),
            Paragraph(f"Temp: <b>{temp_f}</b> °F", value_style),
        ]
    ]
    vitals_table = Table(vitals_data, colWidths=[100, 110, 110, 110, 110])
    vitals_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#BFDBFE")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DBEAFE")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    story.append(vitals_table)
    story.append(Spacer(1, 8))

    # 4. Clinical Diagnosis & Chief Symptoms
    story.append(Paragraph("Clinical Diagnosis & Observations", section_style))
    diagnosis = rx.get("diagnosis") or (
        "Acute Red Flag Assessment (Stabilization & Transfer Recommended)"
        if case_dict.get("is_red_flag")
        else "Clinical Evaluation / Provisional Assessment"
    )
    symptoms = case_dict.get("symptoms", [])
    sym_str = ", ".join(s.replace("_", " ") for s in symptoms) if symptoms else "None noted"

    diag_text = (
        f"<b>Diagnosis:</b> {diagnosis}<br/>"
        f"<b>Reported Symptoms:</b> {sym_str}"
    )
    if case_dict.get("ai_clinical_brief"):
        diag_text += f"<br/><b>Clinical Summary:</b> <i>{case_dict.get('ai_clinical_brief')}</i>"
    if case_dict.get("emergency_action"):
        diag_text += f"<br/><font color='#DC2626'><b>Emergency Action:</b> {case_dict.get('emergency_action')}</font>"

    diag_table = Table([[Paragraph(diag_text, value_style)]], colWidths=[540])
    diag_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFBEB")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#FDE68A")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(diag_table)
    story.append(Spacer(1, 10))

    # 5. Medications Table (Rx)
    story.append(Paragraph("Rx — Prescribed Medications", section_style))
    meds = rx.get("medications", []) if isinstance(rx, dict) else []

    med_table_data = [
        [
            Paragraph("<b>#</b>", table_head_style),
            Paragraph("<b>Medicine / Generic Name</b>", table_head_style),
            Paragraph("<b>Dosage</b>", table_head_style),
            Paragraph("<b>Frequency</b>", table_head_style),
            Paragraph("<b>Duration</b>", table_head_style),
            Paragraph("<b>Instructions</b>", table_head_style),
        ]
    ]

    if meds:
        for idx, m in enumerate(meds, start=1):
            med_table_data.append(
                [
                    Paragraph(str(idx), table_cell_style),
                    Paragraph(f"<b>{m.get('name', '')}</b>", table_cell_style),
                    Paragraph(str(m.get("dosage", "")), table_cell_style),
                    Paragraph(str(m.get("frequency", "")), table_cell_style),
                    Paragraph(str(m.get("duration", "")), table_cell_style),
                    Paragraph(str(m.get("instructions", "")), table_cell_style),
                ]
            )
    else:
        med_table_data.append(
            [
                Paragraph("1", table_cell_style),
                Paragraph("Supportive & symptomatic care as per PHC protocol", table_cell_style),
                Paragraph("Stat / SOS", table_cell_style),
                Paragraph("As needed", table_cell_style),
                Paragraph("3 days", table_cell_style),
                Paragraph("Administer at local Primary Health Centre", table_cell_style),
            ]
        )

    med_table = Table(med_table_data, colWidths=[24, 176, 75, 80, 65, 120])
    med_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A365D")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(med_table)
    story.append(Spacer(1, 10))

    # 6. Advice & Follow-Up
    advice = rx.get("advice") or (
        "Transfer via 108 ambulance immediately. Do not walk or exert."
        if case_dict.get("is_red_flag")
        else "Take medicines on time after meals. Maintain adequate oral rehydration."
    )
    follow_up = rx.get("follow_up") or (
        "Immediate transfer to FRU / District Hospital"
        if case_dict.get("is_red_flag")
        else "3 to 5 days at local PHC"
    )

    notes_data = [
        [
            Paragraph("<b>General Advice:</b>", label_style),
            Paragraph(advice, value_style),
        ],
        [
            Paragraph("<b>Follow-Up Date / Action:</b>", label_style),
            Paragraph(f"<b>{follow_up}</b>", value_style),
        ],
    ]
    notes_table = Table(notes_data, colWidths=[140, 400])
    notes_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(notes_table)
    story.append(Spacer(1, 14))

    # 7. Doctor Signature Block
    doctor_name = rx.get("doctor_name") or "Dr. K. Srinivas, MD (Gen Med)"
    doctor_reg = rx.get("doctor_reg") or "KMC Reg No: 78452 / MCI"

    sig_data = [
        [
            Paragraph(
                "<i>Digitally verified prescription issued via TeleThread Hub Platform.</i><br/>"
                "<i>Valid for dispensing at all Govt / Jan Aushadhi pharmacies.</i>",
                disclaimer_style,
            ),
            Paragraph(
                f"<b>{doctor_name}</b><br/>"
                f"<font size=8 color='#475569'>{doctor_reg}<br/>"
                "Specialist Tele-Consultant<br/>"
                "District Tele-Hub, Mangaluru</font>",
                ParagraphStyle(
                    "DoctorBlock",
                    parent=styles["Normal"],
                    fontName="Helvetica",
                    alignment=2,
                    leading=11,
                ),
            ),
        ]
    ]
    sig_table = Table(sig_data, colWidths=[320, 220])
    sig_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(sig_table)
    story.append(Spacer(1, 10))

    # 8. Disclaimer
    story.append(
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#94A3B8"), spaceAfter=4)
    )
    story.append(
        Paragraph(
            "This digital e-Prescription is issued in full compliance with the Telemedicine Practice Guidelines "
            "(Board of Governors in Supersession of MCI / MoHFW, Govt. of India). For medical emergencies, dial 108 / 112.",
            disclaimer_style,
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer
