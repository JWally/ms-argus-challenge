import type { ConnectionEnvelope } from '../relay/websocket-router.js';
import type { ChallengeSession } from '../sessions/session.js';
import {
  validatePairAttestationBody,
  verifyPairAttestationPayload,
  type AttestationInput,
  type AttestationVerifier,
} from './attestation-bindings.js';
import type { StoredDesktopAttestation, StoredPairAttestation } from './desktop-attestation.js';

type RequestFailure = { ok: false; status: number; body: Record<string, unknown> };

interface ReadyPhoneSession extends ChallengeSession {
  desktopAttestation: StoredDesktopAttestation;
  phoneAttestation?: StoredPairAttestation;
}

export interface PreparedPhoneAttestation {
  ok: true;
  session: ReadyPhoneSession;
  argusSessionId: string;
  attestation: AttestationInput;
  stored: StoredPairAttestation;
  desktopEnvelope: ConnectionEnvelope;
  webauthnInput: unknown;
  oauthInput: unknown;
  deviceTrustToken?: string;
}

export interface PhoneAttestationRequestDependencies {
  loadSession(sessionId: string): Promise<ChallengeSession | null>;
  verifier: AttestationVerifier;
  openDesktopEnvelope(envelope: string): Promise<ConnectionEnvelope | null>;
  claimPhoneArgusSession(
    argusSessionId: string,
    pairSessionId: string
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  nowEpochSeconds(): number;
}

function isStoredAttestation(value: unknown): value is StoredPairAttestation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredPairAttestation>;
  return (
    typeof candidate.publicKey === 'string' &&
    typeof candidate.keyId === 'string' &&
    typeof candidate.argusSessionId === 'string'
  );
}

function readySession(session: ChallengeSession | null): ReadyPhoneSession | RequestFailure {
  if (!session) return { ok: false, status: 404, body: { error: 'session_not_found' } };
  if (!isStoredAttestation(session.desktopAttestation)) {
    return { ok: false, status: 409, body: { error: 'desktop_not_attested_yet' } };
  }
  return session as ReadyPhoneSession;
}

function existingPhoneGate(
  session: ReadyPhoneSession,
  phonePublicKey: string,
  deviceTrustToken: string | undefined
): RequestFailure | null {
  if (session.freshProofRequired && deviceTrustToken) {
    return {
      ok: false,
      status: 401,
      body: { error: 'fresh_proof_required', clearDeviceTrust: false },
    };
  }
  const existingPublicKey =
    session.phoneAttestation &&
    typeof session.phoneAttestation === 'object' &&
    'publicKey' in session.phoneAttestation &&
    typeof session.phoneAttestation.publicKey === 'string'
      ? session.phoneAttestation.publicKey
      : null;
  if (!existingPublicKey) return null;
  return existingPublicKey === phonePublicKey
    ? { ok: false, status: 409, body: { error: 'already_attested' } }
    : {
        ok: false,
        status: 409,
        body: {
          error: 'session_paired_with_other_device',
          reason: 'This QR code is already paired with a different device.',
        },
      };
}

async function authenticateDesktopBinding(
  body: Record<string, unknown>,
  session: ReadyPhoneSession,
  openEnvelope: PhoneAttestationRequestDependencies['openDesktopEnvelope']
): Promise<{ ok: true; envelope: ConnectionEnvelope } | RequestFailure> {
  const sealed = typeof body.desktopEnvelope === 'string' ? body.desktopEnvelope : '';
  const envelope = sealed ? await openEnvelope(sealed) : null;
  if (!envelope || envelope.sessionId !== session.id || envelope.role !== 'desktop') {
    return { ok: false, status: 400, body: { error: 'desktop_binding_unauthenticated' } };
  }
  if (body.desktopArgusSessionId !== session.desktopAttestation.argusSessionId) {
    return { ok: false, status: 400, body: { error: 'desktop_argus_session_mismatch' } };
  }
  if (body.desktopKeyId !== session.desktopAttestation.keyId) {
    return { ok: false, status: 400, body: { error: 'desktop_keyId_mismatch' } };
  }
  return { ok: true, envelope };
}

function preparedPhoneAttestation(input: {
  parsed: Extract<ReturnType<typeof validatePairAttestationBody>, { ok: true }>;
  session: ReadyPhoneSession;
  envelope: ConnectionEnvelope;
  envelopeDecoded: StoredPairAttestation['envelopeDecoded'];
  body: Record<string, unknown>;
  deviceTrustToken?: string;
  receivedAt: number;
}): PreparedPhoneAttestation {
  return {
    ok: true,
    session: input.session,
    argusSessionId: input.parsed.argusSessionId,
    attestation: input.parsed.attestation,
    stored: {
      ...input.parsed.attestation,
      argusSessionId: input.parsed.argusSessionId,
      receivedAt: input.receivedAt,
      envelopeDecoded: input.envelopeDecoded,
    },
    desktopEnvelope: input.envelope,
    webauthnInput: input.body.webauthn,
    oauthInput: input.body.oauth,
    ...(input.deviceTrustToken ? { deviceTrustToken: input.deviceTrustToken } : {}),
  };
}

export async function preparePhoneAttestation(
  body: Record<string, unknown>,
  sessionId: string,
  dependencies: PhoneAttestationRequestDependencies
): Promise<PreparedPhoneAttestation | RequestFailure> {
  const input = validatePairAttestationBody(body);
  if (!input.ok) return input;
  const loaded = readySession(await dependencies.loadSession(sessionId));
  if ('ok' in loaded && !loaded.ok) return loaded;
  const session = loaded as ReadyPhoneSession;
  const deviceTrustToken =
    typeof body.deviceTrustToken === 'string' ? body.deviceTrustToken : undefined;
  const existingFailure = existingPhoneGate(session, input.attestation.publicKey, deviceTrustToken);
  if (existingFailure) return existingFailure;
  const verified = verifyPairAttestationPayload(
    input.attestation,
    {
      role: 'phone',
      sessionId,
      nonce: session.nonce,
      argusSessionId: input.argusSessionId,
    },
    dependencies.verifier
  );
  if (!verified.ok) return verified;
  const desktopBinding = await authenticateDesktopBinding(
    body,
    session,
    dependencies.openDesktopEnvelope
  );
  if (!desktopBinding.ok) return desktopBinding;
  if (input.attestation.keyId === session.desktopAttestation.keyId) {
    return { ok: false, status: 400, body: { error: 'same_device_both_sides' } };
  }
  const claimed = await dependencies.claimPhoneArgusSession(input.argusSessionId, sessionId);
  if (!claimed.ok) {
    return {
      ok: false,
      status: 409,
      body: { error: 'argus_session_already_claimed', reason: claimed.reason },
    };
  }
  return preparedPhoneAttestation({
    parsed: input,
    session,
    envelope: desktopBinding.envelope,
    envelopeDecoded: verified.decoded,
    body,
    ...(deviceTrustToken ? { deviceTrustToken } : {}),
    receivedAt: dependencies.nowEpochSeconds(),
  });
}
