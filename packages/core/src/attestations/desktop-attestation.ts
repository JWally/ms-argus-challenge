import type { ChallengeSession } from '../sessions/session.js';
import {
  validatePairAttestationBody,
  verifyPairAttestationPayload,
  type AttestationInput,
  type AttestationVerifier,
  type DecodedAttestationEnvelope,
} from './attestation-bindings.js';
import {
  prepareHostPreflight,
  type ArgusSessionClaim,
  type StoredHostPreflight,
} from './host-preflight.js';

export interface StoredPairAttestation extends AttestationInput {
  argusSessionId: string;
  receivedAt: number;
  envelopeDecoded: DecodedAttestationEnvelope;
}

export interface StoredDesktopAttestation extends StoredPairAttestation {
  hostAttestation?: StoredHostPreflight;
}

type DesktopFailure = { ok: false; status: number; body: Record<string, unknown> };

async function hostAttestationFor(
  body: Record<string, unknown>,
  session: ChallengeSession,
  dependencies: {
    verifier: AttestationVerifier;
    claimArgusSession: ArgusSessionClaim;
    nowEpochSeconds(): number;
  }
): Promise<{ ok: true; value?: StoredHostPreflight } | DesktopFailure> {
  if (!session.hostPreflightRequired) return { ok: true };
  if (!session.cpi || !session.hostOrigin) {
    return { ok: false, status: 400, body: { error: 'host_preflight_session_invalid' } };
  }
  const host = await prepareHostPreflight(
    body.hostPreflight,
    {
      pairSessionId: session.id,
      challengeId: session.challengeId,
      cpi: session.cpi,
      origin: session.hostOrigin,
    },
    dependencies
  );
  return host.ok ? { ok: true, value: host.stored } : host;
}

export async function prepareDesktopAttestation(
  body: Record<string, unknown>,
  session: ChallengeSession,
  dependencies: {
    verifier: AttestationVerifier;
    claimArgusSession: ArgusSessionClaim;
    nowEpochSeconds(): number;
  }
): Promise<{ ok: true; stored: StoredDesktopAttestation } | DesktopFailure> {
  const input = validatePairAttestationBody(body);
  if (!input.ok) return input;
  const verified = verifyPairAttestationPayload(
    input.attestation,
    {
      role: 'desktop',
      sessionId: session.id,
      nonce: session.nonce,
      argusSessionId: input.argusSessionId,
    },
    dependencies.verifier
  );
  if (!verified.ok) return verified;

  const host = await hostAttestationFor(body, session, dependencies);
  if (!host.ok) return host;

  const claimed = await dependencies.claimArgusSession(input.argusSessionId, session.id, 'desktop');
  if (!claimed.ok) {
    return {
      ok: false,
      status: 409,
      body: { error: 'argus_session_already_claimed', reason: claimed.reason },
    };
  }
  return {
    ok: true,
    stored: {
      ...input.attestation,
      argusSessionId: input.argusSessionId,
      receivedAt: dependencies.nowEpochSeconds(),
      envelopeDecoded: verified.decoded,
      ...(host.value ? { hostAttestation: host.value } : {}),
    },
  };
}
