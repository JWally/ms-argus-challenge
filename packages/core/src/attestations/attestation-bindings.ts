export interface AttestationInput {
  envelope: string;
  signature: string;
  publicKey: string;
  keyId: string;
}

export interface DecodedAttestationEnvelope {
  v: number;
  purpose: string;
  payload: Record<string, unknown>;
  iat: number;
  exp: number;
  keyId: string;
  scanSessionId?: string;
}

export type AttestationVerification =
  { ok: true; decoded: DecodedAttestationEnvelope } | { ok: false; reason: string };

export interface AttestationVerifier {
  verify(attestation: AttestationInput): AttestationVerification;
}

type AttestationFailure = { ok: false; status: 400; body: Record<string, unknown> };

export type PairAttestationBody =
  { ok: true; argusSessionId: string; attestation: AttestationInput } | AttestationFailure;

export function readAttestation(value: unknown): AttestationInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.envelope === 'string' &&
    typeof candidate.signature === 'string' &&
    typeof candidate.publicKey === 'string' &&
    typeof candidate.keyId === 'string'
    ? {
        envelope: candidate.envelope,
        signature: candidate.signature,
        publicKey: candidate.publicKey,
        keyId: candidate.keyId,
      }
    : null;
}

export function validatePairAttestationBody(body: Record<string, unknown>): PairAttestationBody {
  const attestation = readAttestation(body.attestation);
  if (typeof body.argusSessionId !== 'string' || !body.argusSessionId || !attestation) {
    return {
      ok: false,
      status: 400,
      body: { error: 'missing_argusSessionId_or_attestation' },
    };
  }
  return { ok: true, argusSessionId: body.argusSessionId, attestation };
}

function invalid(error: string, reason?: string): AttestationFailure {
  return {
    ok: false,
    status: 400,
    body: { error, ...(reason ? { reason } : {}) },
  };
}

export function verifyPairAttestationPayload(
  attestation: AttestationInput,
  expected: {
    role: 'desktop' | 'phone';
    sessionId: string;
    nonce: string;
    argusSessionId: string;
  },
  verifier: AttestationVerifier
): { ok: true; decoded: DecodedAttestationEnvelope } | AttestationFailure {
  const verified = verifier.verify(attestation);
  if (!verified.ok) return invalid('attestation_invalid', verified.reason);
  if (verified.decoded.scanSessionId !== expected.argusSessionId) {
    return invalid('attestation_scan_mismatch');
  }
  const { payload } = verified.decoded;
  if (payload.sessionId !== expected.sessionId) return invalid('payload_session_mismatch');
  if (payload.nonce !== expected.nonce) return invalid('payload_nonce_mismatch');
  if (payload.role !== expected.role) return invalid('payload_role_mismatch');
  return { ok: true, decoded: verified.decoded };
}

export function validateSsoAttestation(
  body: Record<string, unknown>,
  expected: {
    role: string;
    sessionId?: string;
    nonce?: string;
    returnCode?: string;
    cpi: string;
  },
  verifier: AttestationVerifier
): { ok: true; attestation: AttestationInput } | AttestationFailure {
  const parsed = validatePairAttestationBody(body);
  if (!parsed.ok) return parsed;
  const verified = verifier.verify(parsed.attestation);
  if (!verified.ok) return invalid('attestation_invalid', verified.reason);
  if (verified.decoded.scanSessionId !== parsed.argusSessionId) {
    return invalid('attestation_scan_mismatch');
  }
  const { payload } = verified.decoded;
  if (payload.role !== expected.role) return invalid('payload_role_mismatch');
  if (expected.sessionId && payload.ssoSessionId !== expected.sessionId) {
    return invalid('payload_session_mismatch');
  }
  if (expected.nonce && payload.nonce !== expected.nonce) {
    return invalid('payload_nonce_mismatch');
  }
  if (expected.returnCode && payload.returnCode !== expected.returnCode) {
    return invalid('payload_return_code_mismatch');
  }
  if (payload.cpi !== expected.cpi) return invalid('payload_cpi_mismatch');
  return { ok: true, attestation: parsed.attestation };
}
