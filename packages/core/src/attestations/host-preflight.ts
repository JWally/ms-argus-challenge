import {
  readAttestation,
  type AttestationInput,
  type AttestationVerifier,
  type DecodedAttestationEnvelope,
} from './attestation-bindings.js';

export type ArgusSessionRole = 'host' | 'desktop' | 'phone';
export type ArgusSessionClaim = (
  argusSessionId: string,
  pairSessionId: string,
  role: ArgusSessionRole
) => Promise<{ ok: true } | { ok: false; reason: string }>;

export interface StoredHostPreflight extends AttestationInput {
  argusSessionId: string;
  receivedAt: number;
  envelopeDecoded: DecodedAttestationEnvelope;
  origin: string;
}

type HostFailure = {
  ok: false;
  status: 400 | 409;
  body: Record<string, unknown>;
};

function failure(error: string, reason?: string): HostFailure {
  return {
    ok: false,
    status: error.endsWith('already_claimed') ? 409 : 400,
    body: { error, ...(reason ? { reason } : {}) },
  };
}

function readHostInput(
  value: unknown
): { argusSessionId: string; attestation: AttestationInput } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const attestation = readAttestation(input.attestation);
  return typeof input.argusSessionId === 'string' && input.argusSessionId && attestation
    ? { argusSessionId: input.argusSessionId, attestation }
    : null;
}

export async function prepareHostPreflight(
  value: unknown,
  expected: { pairSessionId: string; challengeId: string; cpi: string; origin: string },
  dependencies: {
    verifier: AttestationVerifier;
    claimArgusSession: ArgusSessionClaim;
    nowEpochSeconds(): number;
  }
): Promise<{ ok: true; stored: StoredHostPreflight } | HostFailure> {
  const input = readHostInput(value);
  if (!input) return failure('host_preflight_invalid');
  const verified = dependencies.verifier.verify(input.attestation);
  if (!verified.ok) return failure('host_preflight_attestation_invalid', verified.reason);
  const { payload } = verified.decoded;
  if (payload.role !== 'host') return failure('host_preflight_role_mismatch');
  if (payload.pairSessionId !== expected.pairSessionId) {
    return failure('host_preflight_session_mismatch');
  }
  if (payload.challengeId !== expected.challengeId) {
    return failure('host_preflight_challenge_mismatch');
  }
  if (payload.cpi !== expected.cpi) return failure('host_preflight_cpi_mismatch');
  if (payload.origin !== expected.origin) return failure('host_preflight_origin_mismatch');
  if (typeof payload.nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.nonce)) {
    return failure('host_preflight_nonce_invalid');
  }
  if (verified.decoded.scanSessionId !== input.argusSessionId) {
    return failure('host_preflight_scan_mismatch');
  }
  const claimed = await dependencies.claimArgusSession(
    input.argusSessionId,
    expected.pairSessionId,
    'host'
  );
  if (!claimed.ok) return failure('host_preflight_already_claimed', claimed.reason);
  return {
    ok: true,
    stored: {
      ...input.attestation,
      argusSessionId: input.argusSessionId,
      receivedAt: dependencies.nowEpochSeconds(),
      envelopeDecoded: verified.decoded,
      origin: expected.origin,
    },
  };
}
