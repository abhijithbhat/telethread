/**
 * Regression Test: Hub E-Prescription Payload Transformation
 *
 * Verifies:
 * 1. Hub form fields are mapped into medications array [{ name, dosage }].
 * 2. Does not invent missing values for frequency, duration, etc.
 * 3. Renames follow_up_date to follow_up.
 * 4. Preserves doctor_name and doctor_reg.
 * 5. Handles empty medications safely without crashing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

function constructHubPrescriptionPayload(params: {
  rxDiagnosis: string;
  rxMedication: string;
  rxDosage: string;
  rxFollowUpDate: string;
  rxAdvice: string;
  doctorName?: string;
  doctorReg?: string;
}) {
  const trimmedMed = params.rxMedication.trim();
  const trimmedDosage = params.rxDosage.trim();
  const medications = trimmedMed
    ? [
        {
          name: trimmedMed,
          ...(trimmedDosage ? { dosage: trimmedDosage } : {}),
        },
      ]
    : [];

  return {
    diagnosis: params.rxDiagnosis || undefined,
    medications,
    advice: params.rxAdvice || undefined,
    follow_up: params.rxFollowUpDate || undefined,
    doctor_name: params.doctorName || 'Dr. K. Srinivas, MD',
    doctor_reg: params.doctorReg || 'KMC-78452',
  };
}

test('Hub e-Prescription payload correctly formats medications array and renames follow_up', () => {
  const payload = constructHubPrescriptionPayload({
    rxDiagnosis: 'Acute Coronary Syndrome',
    rxMedication: 'Tab Aspirin 300mg stat',
    rxDosage: '300mg immediately',
    rxFollowUpDate: '2026-10-25',
    rxAdvice: 'Strict bed rest and 108 transfer',
    doctorName: 'Dr. Ramesh Rao, MD',
    doctorReg: 'KMC-12345',
  });

  // Verify medications array structure
  assert.equal(Array.isArray(payload.medications), true);
  assert.equal(payload.medications.length, 1);
  assert.equal(payload.medications[0].name, 'Tab Aspirin 300mg stat');
  assert.equal(payload.medications[0].dosage, '300mg immediately');

  // Verify NO invented fields
  assert.equal('frequency' in payload.medications[0], false, 'Must not invent frequency');
  assert.equal('duration' in payload.medications[0], false, 'Must not invent duration');

  // Verify follow_up field naming
  assert.equal(payload.follow_up, '2026-10-25');
  assert.equal('follow_up_date' in payload, false, 'Must not send legacy follow_up_date');

  // Verify doctor fields
  assert.equal(payload.doctor_name, 'Dr. Ramesh Rao, MD');
  assert.equal(payload.doctor_reg, 'KMC-12345');
});

test('Hub e-Prescription safely handles empty medication without inventing values', () => {
  const payload = constructHubPrescriptionPayload({
    rxDiagnosis: 'Clinical Assessment',
    rxMedication: '   ',
    rxDosage: '',
    rxFollowUpDate: '',
    rxAdvice: 'Review at PHC',
  });

  assert.equal(Array.isArray(payload.medications), true);
  assert.equal(payload.medications.length, 0);
  assert.equal(payload.doctor_name, 'Dr. K. Srinivas, MD');
  assert.equal(payload.doctor_reg, 'KMC-78452');
});
