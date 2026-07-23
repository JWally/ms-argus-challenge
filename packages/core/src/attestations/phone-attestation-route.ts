import type { MerchantProjection } from '@argus-challenge/contracts';
import type { ApplicationResponse } from '../http/application-response.js';
import type { ProofOfLifeAnnotations } from '../proofs/proof-of-life.js';
import type { ClassifiedProjection } from '../verdicts/projection-policy.js';
import { classifyProjection } from '../verdicts/projection-policy.js';
import { decidePhoneVerdict } from '../verdicts/phone-verdict-decision.js';
import type { PreparedPhoneAttestation } from './phone-attestation-request.js';

type PreparationFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

type CommitOutcome =
  | { outcome: 'committed' }
  | { outcome: 'same_device_retry' }
  | { outcome: 'other_device' }
  | { outcome: 'write_conflict' };

export interface DesktopEvidence {
  desktopProjection: MerchantProjection | null;
  desktopScan: ClassifiedProjection | null;
  annotations: Record<string, unknown>;
}

export interface PhoneAttestationRouteDependencies {
  prepare(
    body: Record<string, unknown>,
    sessionId: string
  ): Promise<PreparedPhoneAttestation | PreparationFailure>;
  verifyDeviceTrust(
    token: string,
    requesterIp: string,
    phonePublicKey: string
  ): Promise<{ ok: boolean; reason?: string; ipChanged?: boolean }>;
  verifyProof(input: {
    webauthn: unknown;
    oauth: unknown;
    expectedNonce: string;
    argusPublicKey: string;
    trustRedeemed: boolean;
  }): Promise<ProofOfLifeAnnotations>;
  collectDesktopEvidence(input: {
    hostArgusSessionId: string | null;
    iframeArgusSessionId: string;
    pairSessionId: string;
  }): Promise<DesktopEvidence>;
  fetchPhoneProjection(argusSessionId: string): Promise<MerchantProjection | null>;
  mintDeviceTrust(publicKey: string, keyId: string, requesterIp: string): Promise<string | null>;
  commit(input: {
    sessionId: string;
    stored: PreparedPhoneAttestation['stored'];
    verdict: 'paired' | 'failed';
    reason: string;
    annotations: Record<string, unknown>;
  }): Promise<CommitOutcome>;
  deliverVerdict(input: {
    desktopEnvelope: PreparedPhoneAttestation['desktopEnvelope'];
    sessionId: string;
    verdict: 'paired' | 'failed';
    reason: string;
    annotations: Record<string, unknown>;
    nextDeviceTrust: string | null;
    decidedAt: number;
    now: number;
  }): Promise<Record<string, unknown>>;
  nowEpochSeconds(): number;
  proofRequiredByDefault: boolean;
}

type DeviceTrust = { redeemed: boolean; ipChanged: boolean };
type Response = ApplicationResponse<Record<string, unknown>>;

async function redeemDeviceTrust(
  prepared: PreparedPhoneAttestation,
  requesterIp: string,
  dependencies: PhoneAttestationRouteDependencies
): Promise<DeviceTrust | Response> {
  if (!prepared.deviceTrustToken) return { redeemed: false, ipChanged: false };
  const result = await dependencies.verifyDeviceTrust(
    prepared.deviceTrustToken,
    requesterIp,
    prepared.attestation.publicKey
  );
  if (!result.ok) {
    return {
      status: 401,
      body: { error: 'device_trust_invalid', reason: result.reason ?? 'invalid' },
    };
  }
  return { redeemed: true, ipChanged: result.ipChanged === true };
}

function isResponse(value: DeviceTrust | Response): value is Response {
  return 'status' in value;
}

function hostArgusSessionId(prepared: PreparedPhoneAttestation): string | null {
  return prepared.session.desktopAttestation.hostAttestation?.argusSessionId ?? null;
}

function trustAnnotations(trust: DeviceTrust): Record<string, unknown> {
  return trust.redeemed
    ? {
        phone_device_trust_redeemed: true,
        phone_device_trust_ip_changed: trust.ipChanged,
      }
    : {};
}

async function mintTrustIfEligible(
  input: {
    prepared: PreparedPhoneAttestation;
    requesterIp: string;
    trust: DeviceTrust;
    verdict: 'paired' | 'failed';
    proof: ProofOfLifeAnnotations;
  },
  dependencies: PhoneAttestationRouteDependencies
): Promise<string | null> {
  if (input.trust.redeemed || input.verdict !== 'paired' || !input.proof.phone_webauthn_attested) {
    return null;
  }
  return dependencies.mintDeviceTrust(
    input.prepared.attestation.publicKey,
    input.prepared.attestation.keyId,
    input.requesterIp
  );
}

function commitConflict(outcome: CommitOutcome['outcome']): Response | null {
  if (outcome === 'committed') return null;
  if (outcome === 'same_device_retry') {
    return {
      status: 200,
      body: { verdict: 'complete', reason: null, annotations: {}, concurrent_loser: true },
    };
  }
  if (outcome === 'other_device') {
    return {
      status: 409,
      body: {
        error: 'session_paired_with_other_device',
        reason: 'This QR code is already paired with a different device.',
      },
    };
  }
  return { status: 409, body: { error: 'write_conflict' } };
}

async function collectDecision(
  prepared: PreparedPhoneAttestation,
  trust: DeviceTrust,
  dependencies: PhoneAttestationRouteDependencies
) {
  const [proof, desktop, phoneProjection] = await Promise.all([
    dependencies.verifyProof({
      webauthn: prepared.webauthnInput,
      oauth: prepared.oauthInput,
      expectedNonce: prepared.session.nonce,
      argusPublicKey: prepared.attestation.publicKey,
      trustRedeemed: trust.redeemed,
    }),
    dependencies.collectDesktopEvidence({
      hostArgusSessionId: hostArgusSessionId(prepared),
      iframeArgusSessionId: prepared.session.desktopAttestation.argusSessionId,
      pairSessionId: prepared.session.id,
    }),
    dependencies.fetchPhoneProjection(prepared.argusSessionId),
  ]);
  const decision = decidePhoneVerdict(
    {
      proofRequired: prepared.session.proofRequired || dependencies.proofRequiredByDefault,
      proofAnnotations: proof,
      desktopProjection: desktop.desktopProjection,
      phoneProjection,
      desktopScan: desktop.desktopScan,
      phoneScan: phoneProjection ? classifyProjection(phoneProjection) : null,
      hostAnnotations: desktop.annotations,
    },
    dependencies.nowEpochSeconds() * 1000
  );
  return {
    proof,
    decision,
    annotations: { ...decision.annotations, ...trustAnnotations(trust) },
  };
}

async function commitAndDeliver(input: {
  prepared: PreparedPhoneAttestation;
  requesterIp: string;
  trust: DeviceTrust;
  sessionId: string;
  evidence: Awaited<ReturnType<typeof collectDecision>>;
  dependencies: PhoneAttestationRouteDependencies;
}): Promise<Response> {
  const { prepared, evidence, dependencies } = input;
  const nextDeviceTrust = await mintTrustIfEligible(
    {
      prepared,
      requesterIp: input.requesterIp,
      trust: input.trust,
      verdict: evidence.decision.verdict,
      proof: evidence.proof,
    },
    dependencies
  );
  const committed = await dependencies.commit({
    sessionId: input.sessionId,
    stored: prepared.stored,
    verdict: evidence.decision.verdict,
    reason: evidence.decision.reason,
    annotations: evidence.annotations,
  });
  const conflict = commitConflict(committed.outcome);
  if (conflict) return conflict;
  return {
    status: 200,
    body: await dependencies.deliverVerdict({
      desktopEnvelope: prepared.desktopEnvelope,
      sessionId: input.sessionId,
      verdict: evidence.decision.verdict,
      reason: evidence.decision.reason,
      annotations: evidence.annotations,
      nextDeviceTrust,
      decidedAt: prepared.stored.receivedAt,
      now: dependencies.nowEpochSeconds(),
    }),
  };
}

export function createPhoneAttestationHandler(dependencies: PhoneAttestationRouteDependencies) {
  return async (
    body: Record<string, unknown>,
    sessionId: string,
    requesterIp: string
  ): Promise<Response> => {
    const prepared = await dependencies.prepare(body, sessionId);
    if (!prepared.ok) return { status: prepared.status, body: prepared.body };
    const trust = await redeemDeviceTrust(prepared, requesterIp, dependencies);
    if (isResponse(trust)) return trust;
    return commitAndDeliver({
      prepared,
      requesterIp,
      trust,
      dependencies,
      sessionId,
      evidence: await collectDecision(prepared, trust, dependencies),
    });
  };
}
