import type { MerchantProjection } from '@argus-challenge/contracts';
import type { AttestationInput } from '../attestations/attestation-bindings.js';
import { evaluateSsoContinuity, type SsoContinuityVerdict } from './continuity.js';
import { ssoFailureReturn } from './merchant-binding.js';
import { profileFromProjection, requirePhoneProfile } from './profile.js';
import { hashApprovalToken, hashSsoReturnCode, tokenHashesEqual } from './token-hash.js';
import type { SsoAttestationResult, SsoSession, StoredSsoValidation } from './types.js';

export type SsoValidationProofResult =
  | {
      ok: true;
      annotations: Record<string, unknown>;
      trustRedeemed: boolean;
    }
  | { ok: false; status: 401; body: Record<string, unknown> };

export interface SsoValidationDependencies {
  loadSession(sessionId: string): Promise<SsoSession | null>;
  validateAttestation(
    body: Record<string, unknown>,
    expected: {
      role: 'merchant-validate';
      sessionId: string;
      nonce: string;
      returnCode: string;
      cpi: string;
    }
  ): SsoAttestationResult;
  fetchProjection(argusSessionId: string): Promise<MerchantProjection | null>;
  verifyProof(input: {
    body: Record<string, unknown>;
    requesterIp: string;
    attestation: AttestationInput;
    nonce: string;
    proofRequired: boolean;
    freshProofRequired: boolean;
  }): Promise<SsoValidationProofResult>;
  mintApprovalToken(): string;
  mintDeviceTrust(publicKey: string, keyId: string, requesterIp: string): Promise<string | null>;
  recordValidation(validation: StoredSsoValidation): Promise<boolean>;
  nowEpochSeconds(): number;
  approvalTtlSeconds: number;
}

export type SsoValidationResult =
  | {
      ok: true;
      verdict: SsoContinuityVerdict;
      approvalToken: string | null;
      merchantSessionId: string;
      cpi: string;
      merchantCallbackUrl?: string;
      merchantChallengeId?: string;
      nextDeviceTrust: string | null;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

function readReturnCode(
  session: SsoSession,
  body: Record<string, unknown>,
  now: number
):
  | { ok: true; value: string; challengeProfile: SsoSession['startProfile'] }
  | { ok: false; status: 401 | 409; body: Record<string, unknown> } {
  if (!session.challengeProfile || !session.returnCodeHash || !session.returnCodeExpiresAt) {
    return { ok: false, status: 409, body: { error: 'sso_challenge_not_completed' } };
  }
  if (session.returnCodeConsumedAt) {
    return { ok: false, status: 409, body: { error: 'sso_return_code_consumed' } };
  }
  const value = typeof body.returnCode === 'string' ? body.returnCode : '';
  if (!value || !tokenHashesEqual(session.returnCodeHash, hashSsoReturnCode(value))) {
    return { ok: false, status: 401, body: { error: 'sso_return_code_invalid' } };
  }
  if (now > session.returnCodeExpiresAt) {
    return { ok: false, status: 401, body: { error: 'sso_return_code_expired' } };
  }
  return { ok: true, value, challengeProfile: session.challengeProfile };
}

async function nextDeviceTrust(
  verdict: SsoContinuityVerdict,
  proof: Extract<SsoValidationProofResult, { ok: true }>,
  attestation: AttestationInput,
  requesterIp: string,
  dependencies: SsoValidationDependencies
): Promise<string | null> {
  return verdict.ok && !proof.trustRedeemed && proof.annotations.phone_webauthn_attested === true
    ? dependencies.mintDeviceTrust(attestation.publicKey, attestation.keyId, requesterIp)
    : null;
}

type ValidationFailure = Extract<SsoValidationResult, { ok: false }>;

interface PreparedValidation {
  ok: true;
  session: SsoSession;
  now: number;
  returnCode: Extract<ReturnType<typeof readReturnCode>, { ok: true }>;
  attestation: AttestationInput;
  profile: ReturnType<typeof profileFromProjection>;
}

async function prepareValidation(
  sessionId: string,
  body: Record<string, unknown>,
  dependencies: SsoValidationDependencies
): Promise<PreparedValidation | ValidationFailure> {
  const session = await dependencies.loadSession(sessionId);
  const now = dependencies.nowEpochSeconds();
  if (!session || session.expiresAt < now) {
    return { ok: false, status: 404, body: { error: 'sso_session_not_found' } };
  }
  const returnCode = readReturnCode(session, body, now);
  if (!returnCode.ok) return { ok: false, status: returnCode.status, body: returnCode.body };
  const checked = dependencies.validateAttestation(body, {
    role: 'merchant-validate',
    sessionId,
    nonce: session.nonce,
    returnCode: returnCode.value,
    cpi: session.cpi,
  });
  if (!checked.ok) return { ok: false, status: checked.status, body: checked.body };
  const argusSessionId = String(body.argusSessionId);
  const profile = profileFromProjection(
    argusSessionId,
    checked.attestation,
    await dependencies.fetchProjection(argusSessionId)
  );
  const phone = requirePhoneProfile(
    profile,
    'validate',
    ssoFailureReturn(sessionId, session.cpi, session)
  );
  return phone.ok
    ? { ok: true, session, now, returnCode, attestation: checked.attestation, profile }
    : { ok: false, status: phone.status, body: phone.body };
}

function storedValidation(input: {
  sessionId: string;
  profile: PreparedValidation['profile'];
  verdict: SsoContinuityVerdict;
  approvalToken: string | null;
  proof: Extract<SsoValidationProofResult, { ok: true }>;
  now: number;
  approvalTtlSeconds: number;
}): StoredSsoValidation {
  return {
    sessionId: input.sessionId,
    validateProfile: input.profile,
    verdict: input.verdict.ok ? 'approved' : 'failed',
    verdictReason: input.verdict.reason,
    returnCodeConsumedAt: input.now,
    proofAnnotations: input.proof.annotations,
    ...(input.verdict.ok && input.approvalToken
      ? {
          approval: {
            approvedAt: input.now,
            approvalTokenHash: hashApprovalToken(input.approvalToken),
            expiresAt: input.now + input.approvalTtlSeconds,
          },
        }
      : {}),
  };
}

function successResult(
  prepared: PreparedValidation,
  verdict: SsoContinuityVerdict,
  approvalToken: string | null,
  trust: string | null
): SsoValidationResult {
  return {
    ok: true,
    verdict,
    approvalToken,
    merchantSessionId: prepared.session.merchantSessionId,
    cpi: prepared.session.cpi,
    ...(prepared.session.merchantCallbackUrl
      ? { merchantCallbackUrl: prepared.session.merchantCallbackUrl }
      : {}),
    ...(prepared.session.merchantChallengeId
      ? { merchantChallengeId: prepared.session.merchantChallengeId }
      : {}),
    nextDeviceTrust: trust,
  };
}

export async function validateSsoSession(
  sessionId: string,
  body: Record<string, unknown>,
  requesterIp: string,
  dependencies: SsoValidationDependencies
): Promise<SsoValidationResult> {
  const prepared = await prepareValidation(sessionId, body, dependencies);
  if (!prepared.ok) return prepared;
  const proof = await dependencies.verifyProof({
    body,
    requesterIp,
    attestation: prepared.attestation,
    nonce: prepared.session.nonce,
    proofRequired: prepared.session.proofRequired,
    freshProofRequired: prepared.session.freshProofRequired,
  });
  if (!proof.ok) return proof;
  const verdict = evaluateSsoContinuity({
    start: prepared.session.startProfile,
    challenge: prepared.returnCode.challengeProfile,
    validate: prepared.profile,
  });
  const approvalToken = verdict.ok ? dependencies.mintApprovalToken() : null;
  const trust = await nextDeviceTrust(
    verdict,
    proof,
    prepared.attestation,
    requesterIp,
    dependencies
  );
  const validation = storedValidation({
    sessionId,
    profile: prepared.profile,
    verdict,
    approvalToken,
    proof,
    now: prepared.now,
    approvalTtlSeconds: dependencies.approvalTtlSeconds,
  });
  if (!(await dependencies.recordValidation(validation))) {
    return { ok: false, status: 409, body: { error: 'sso_return_code_consumed' } };
  }
  return successResult(prepared, verdict, approvalToken, trust);
}
