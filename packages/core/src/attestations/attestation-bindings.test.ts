import { describe, expect, it, vi } from 'vitest';
import type { AttestationInput, AttestationVerifier } from './attestation-bindings.js';
import {
  validatePairAttestationBody,
  validateSsoAttestation,
  verifyPairAttestationPayload,
} from './attestation-bindings.js';

const attestation: AttestationInput = {
  envelope: 'envelope',
  signature: 'signature',
  publicKey: 'public-key',
  keyId: 'key-id',
};

function verifier(payload: Record<string, unknown>, scanSessionId = 'argus-1') {
  return {
    verify: vi.fn(() => ({
      ok: true as const,
      decoded: {
        v: 1,
        purpose: 'argus-pair-v1',
        payload,
        iat: 1,
        exp: 2,
        keyId: 'key-id',
        scanSessionId,
      },
    })),
  } satisfies AttestationVerifier;
}

describe('attestation request and binding policy', () => {
  it('keeps the stable missing-attestation response', () => {
    expect(validatePairAttestationBody({ argusSessionId: 'argus-1' })).toEqual({
      ok: false,
      status: 400,
      body: { error: 'missing_argusSessionId_or_attestation' },
    });
  });

  it('accepts the exact role/session/nonce/scan binding', () => {
    expect(
      verifyPairAttestationPayload(
        attestation,
        { role: 'phone', sessionId: 'session-1', nonce: 'nonce-1', argusSessionId: 'argus-1' },
        verifier({ role: 'phone', sessionId: 'session-1', nonce: 'nonce-1' })
      )
    ).toMatchObject({ ok: true });
  });

  it.each([
    [{ role: 'phone', sessionId: 'wrong', nonce: 'nonce-1' }, 'payload_session_mismatch'],
    [{ role: 'phone', sessionId: 'session-1', nonce: 'wrong' }, 'payload_nonce_mismatch'],
    [{ role: 'desktop', sessionId: 'session-1', nonce: 'nonce-1' }, 'payload_role_mismatch'],
  ])('rejects payload substitution %#', (payload, error) => {
    expect(
      verifyPairAttestationPayload(
        attestation,
        { role: 'phone', sessionId: 'session-1', nonce: 'nonce-1', argusSessionId: 'argus-1' },
        verifier(payload)
      )
    ).toMatchObject({ ok: false, status: 400, body: { error } });
  });

  it('rejects Argus scan substitution', () => {
    expect(
      verifyPairAttestationPayload(
        attestation,
        { role: 'phone', sessionId: 'session-1', nonce: 'nonce-1', argusSessionId: 'argus-2' },
        verifier({ role: 'phone', sessionId: 'session-1', nonce: 'nonce-1' })
      )
    ).toMatchObject({ ok: false, body: { error: 'attestation_scan_mismatch' } });
  });

  it('validates SSO role, session, nonce, return-code, CPI, and scan bindings', () => {
    const body = { argusSessionId: 'argus-1', attestation };
    const valid = verifier({
      role: 'merchant-validate',
      ssoSessionId: 'sso-1',
      nonce: 'nonce-1',
      returnCode: 'return-1',
      cpi: 'argus_cpi_test_Example12345.forceauth',
    });
    expect(
      validateSsoAttestation(
        body,
        {
          role: 'merchant-validate',
          sessionId: 'sso-1',
          nonce: 'nonce-1',
          returnCode: 'return-1',
          cpi: 'argus_cpi_test_Example12345.forceauth',
        },
        valid
      )
    ).toMatchObject({ ok: true });
  });
});
