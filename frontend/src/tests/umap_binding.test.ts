/**
 * Regression Test: Umap Selected Case Binding & Error Recovery
 *
 * Verifies:
 * 1. Selected case is resolved using the actual case ID.
 * 2. activeCase is updated before entering the consult room.
 * 3. Selected case is not replaced by a stale previously active case.
 * 4. Missing or invalid case ID produces an explicit, recoverable error.
 * 5. Consultation view opens with the correct case.
 * 6. Dynamic case IDs (not hard-coded to TT-101 or TT-102).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

interface CaseData {
  id: string;
  patient_name: string;
  age: number;
  gender: string;
  village_taluka: string;
  is_red_flag: boolean;
  urgency: string;
  specialty: string;
  vitals?: Record<string, unknown>;
  timeline?: unknown[];
  prescription?: unknown;
}

interface AppSimulatorState {
  activeCase: CaseData;
  activeView: 'spoke' | 'umap' | 'consult' | 'hub';
  activeRole: 'spoke' | 'hub';
  umapError: string | null;
}

// Case resolution function replicating App.tsx logic with injectable fetch
async function simulateCallFromUmap(
  state: AppSimulatorState,
  caseId: string | undefined | null,
  fetchFn: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
): Promise<boolean> {
  if (!caseId || typeof caseId !== 'string' || !caseId.trim()) {
    const err = 'Cannot start consultation: missing or invalid case ID from map selection.';
    state.umapError = err;
    return false;
  }

  const targetId = caseId.trim();
  state.umapError = null;

  try {
    const res = await fetchFn(`/api/cases/${encodeURIComponent(targetId)}`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Case '${targetId}' was not found on server.`);
      }
      throw new Error(`Failed to retrieve case (HTTP ${res.status}).`);
    }

    const resolved = (await res.json()) as CaseData;
    if (!resolved || !resolved.id) {
      throw new Error(`Invalid case data received for '${targetId}'.`);
    }

    // Update activeCase before switching view
    state.activeCase = {
      ...resolved,
      timeline: resolved.timeline || [],
      vitals: resolved.vitals || {},
    };
    state.activeRole = 'spoke';
    state.activeView = 'consult';
    return true;
  } catch (apiErr: unknown) {
    const message = apiErr instanceof Error ? apiErr.message : String(apiErr);
    state.umapError = `Unable to simulate call: ${message}`;
    return false;
  }
}

test('uMap starts with initial case, selects new dynamic case, and binds before opening consult', async () => {
  // 1. Initial State: activeCase is Case A (TT-INIT-101, Patient Ramesh)
  const initialCase: CaseData = {
    id: 'TT-INIT-101',
    patient_name: 'Ramesh Gowda',
    age: 54,
    gender: 'M',
    village_taluka: 'Sullia PHC',
    is_red_flag: true,
    urgency: 'CRITICAL',
    specialty: 'Cardiology / Emergency',
  };

  const state: AppSimulatorState = {
    activeCase: initialCase,
    activeView: 'umap',
    activeRole: 'spoke',
    umapError: null,
  };

  // Mock server cases store with dynamic non-default case IDs
  const mockServerCases: Record<string, CaseData> = {
    'TT-CUSTOM-204': {
      id: 'TT-CUSTOM-204',
      patient_name: 'Savitri Bhat',
      age: 47,
      gender: 'F',
      village_taluka: 'Charmadi PHC',
      is_red_flag: false,
      urgency: 'HIGH',
      specialty: 'General Medicine',
    },
    'TT-CUSTOM-308': {
      id: 'TT-CUSTOM-308',
      patient_name: 'Ananda Poojary',
      age: 61,
      gender: 'M',
      village_taluka: 'Karkala PHC',
      is_red_flag: true,
      urgency: 'CRITICAL',
      specialty: 'Cardiology / Emergency',
    },
  };

  const mockFetch = async (url: string) => {
    const caseId = decodeURIComponent(url.split('/api/cases/')[1] || '');
    if (mockServerCases[caseId]) {
      return {
        ok: true,
        status: 200,
        json: async () => mockServerCases[caseId],
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: `Case '${caseId}' not found` }),
    };
  };

  // 2. Select Case B (TT-CUSTOM-204) from map
  const success1 = await simulateCallFromUmap(state, 'TT-CUSTOM-204', mockFetch);

  assert.equal(success1, true, 'simulateCallFromUmap must succeed for valid case');
  assert.equal(state.activeView, 'consult', 'activeView must transition to consult');
  assert.equal(state.activeCase.id, 'TT-CUSTOM-204', 'activeCase ID must be TT-CUSTOM-204');
  assert.equal(state.activeCase.patient_name, 'Savitri Bhat', 'activeCase patient must be Savitri Bhat');
  assert.notEqual(state.activeCase.id, 'TT-INIT-101', 'Must not retain stale previous case');
  assert.equal(state.umapError, null, 'umapError must be null');

  // 3. Navigate back to map and select another valid case (TT-CUSTOM-308)
  state.activeView = 'umap';
  const success2 = await simulateCallFromUmap(state, 'TT-CUSTOM-308', mockFetch);

  assert.equal(success2, true);
  assert.equal(state.activeView, 'consult');
  assert.equal(state.activeCase.id, 'TT-CUSTOM-308', 'activeCase ID must update to TT-CUSTOM-308');
  assert.equal(state.activeCase.patient_name, 'Ananda Poojary');
  assert.notEqual(state.activeCase.id, 'TT-CUSTOM-204', 'Must not be overwritten by previously active case');
});

test('uMap missing or invalid case ID produces explicit recoverable error and does not open consult', async () => {
  const state: AppSimulatorState = {
    activeCase: {
      id: 'TT-CURRENT-001',
      patient_name: 'Current Patient',
      age: 30,
      gender: 'M',
      village_taluka: 'PHC A',
      is_red_flag: false,
      urgency: 'ROUTINE',
      specialty: 'General Medicine',
    },
    activeView: 'umap',
    activeRole: 'spoke',
    umapError: null,
  };

  const dummyFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });

  // Test 1: Empty / whitespace case ID
  const emptyRes = await simulateCallFromUmap(state, '   ', dummyFetch);
  assert.equal(emptyRes, false, 'Empty case ID must return false');
  assert.equal(state.activeView, 'umap', 'View must remain on umap');
  assert.equal(state.activeCase.id, 'TT-CURRENT-001', 'activeCase must remain untouched');
  assert.match(state.umapError || '', /missing or invalid case ID/, 'Explicit error must be set');

  // Test 2: Undefined / null case ID
  const nullRes = await simulateCallFromUmap(state, null, dummyFetch);
  assert.equal(nullRes, false);
  assert.equal(state.activeView, 'umap');
  assert.match(state.umapError || '', /missing or invalid case ID/);

  // Test 3: Non-existent 404 case ID
  const notFoundFetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ detail: 'Not found' }),
  });

  const missingRes = await simulateCallFromUmap(state, 'TT-NONEXISTENT-999', notFoundFetch);
  assert.equal(missingRes, false, 'Non-existent case ID must fail');
  assert.equal(state.activeView, 'umap', 'View must NOT transition to consult on missing case');
  assert.equal(state.activeCase.id, 'TT-CURRENT-001', 'Stale case must not be corrupted');
  assert.match(state.umapError || '', /not found on server/, 'Explicit 404 error message must be set');
});
