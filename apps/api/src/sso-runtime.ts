import { randomBytes, randomUUID } from 'node:crypto';
import {
  SSO_APPROVAL_TTL_SECONDS,
  approvalCookie,
  challengeSsoSession,
  createSsoApprovalExchangeHandler,
  createSsoApprovalRedemptionHandler,
  startSsoSession,
  validateSsoAttestation,
  validateSsoSession,
  verifySsoValidationProof,
  type ApplicationResponse,
  type SsoValidationResult,
} from '@argus-challenge/core';
import { verifyPhoneProof } from './proof-runtime.js';
import type { SharedRuntime } from './shared-runtime.js';

type Response = ApplicationResponse<Record<string, unknown>>;

function startResponse(started: Awaited<ReturnType<typeof startSsoSession>>): Response {
  if (!started.ok) return { status: started.status, body: started.body };
  return {
    status: 200,
    body: {
      sessionId: started.sessionId,
      nonce: started.session.nonce,
      expiresAt: started.session.expiresAt,
      cpi: started.session.cpi,
      proofRequired: started.session.proofRequired,
      freshProofRequired: started.session.freshProofRequired,
      challengeUrl: `/sso/challenge/${started.sessionId}`,
      failureReturnUrl: started.failureReturnUrl,
    },
  };
}

function challengeResponse(challenged: Awaited<ReturnType<typeof challengeSsoSession>>): Response {
  if (!challenged.ok) return { status: challenged.status, body: challenged.body };
  const query = new URLSearchParams({
    session: challenged.sessionId,
    code: challenged.returnCode,
    cpi: challenged.cpi,
    ...(challenged.hasMerchantCallback ? { flow: 'merchant' } : {}),
  });
  return {
    status: 200,
    body: {
      ok: true,
      returnCode: challenged.returnCode,
      returnUrl: `/merchant/validate?${query.toString()}`,
    },
  };
}

function validationResponse(result: SsoValidationResult): Response {
  if (!result.ok) return { status: result.status, body: result.body };
  const merchantBound = Boolean(result.merchantCallbackUrl && result.merchantChallengeId);
  return {
    status: result.verdict.ok ? 200 : 403,
    headers: { 'Cache-Control': 'no-store' },
    ...(result.verdict.ok && result.approvalToken && !merchantBound
      ? { cookies: [approvalCookie(result.approvalToken, SSO_APPROVAL_TTL_SECONDS)] }
      : {}),
    body: {
      verdict: result.verdict.ok ? 'approved' : 'failed',
      reason: result.verdict.reason,
      reasons: result.verdict.reasons,
      merchantSessionId: result.merchantSessionId,
      cpi: result.cpi,
      ...(merchantBound
        ? {
            merchantCallbackUrl: result.merchantCallbackUrl,
            merchantChallengeId: result.merchantChallengeId,
            ...(result.verdict.ok && result.approvalToken
              ? { approvalCode: result.approvalToken }
              : {}),
          }
        : {}),
      nextDeviceTrust: result.nextDeviceTrust,
    },
  };
}

function verifyValidationProof(
  runtime: SharedRuntime,
  input: Parameters<typeof verifySsoValidationProof>[0]
) {
  return verifySsoValidationProof(input, {
    verifyDeviceTrust: async (token, ip, publicKey) =>
      runtime.deviceTrust.verify(token, ip, publicKey),
    verifyProofOfLife: (proof) =>
      verifyPhoneProof(runtime, {
        webauthn: proof.webauthn,
        oauth: proof.oauth,
        expectedNonce: proof.expectedNonce,
        argusPublicKey: proof.argusPublicKey,
        trustRedeemed: proof.trustRedeemed,
      }),
  });
}

function attestationValidator(runtime: SharedRuntime) {
  return (body: Record<string, unknown>, expected: Parameters<typeof validateSsoAttestation>[1]) =>
    validateSsoAttestation(body, expected, runtime.attestationVerifier);
}

function startHandler(runtime: SharedRuntime) {
  return async (body: Record<string, unknown>) =>
    startResponse(
      await startSsoSession(body, {
        callbackOrigins: runtime.config.ssoCallbackOrigins,
        validateAttestation: attestationValidator(runtime),
        fetchProjection: runtime.fetchProjection,
        createSession: runtime.sso.createSession,
        newSessionId: randomUUID,
        newNonce: () => randomBytes(32).toString('base64url'),
        newMerchantSessionId: randomUUID,
        nowEpochSeconds: runtime.nowEpochSeconds,
        sessionTtlSeconds: runtime.config.sessionTtlSeconds,
        proofRequiredByDefault: runtime.config.proofRequiredByDefault,
      })
    );
}

function challengeHandler(runtime: SharedRuntime) {
  return async (sessionId: string, body: Record<string, unknown>) =>
    challengeResponse(
      await challengeSsoSession(sessionId, body, {
        loadSession: runtime.sso.loadSession,
        validateAttestation: attestationValidator(runtime),
        fetchProjection: runtime.fetchProjection,
        mintReturnCode: () => ({
          value: `sso_${randomBytes(24).toString('base64url')}`,
          expiresAt: runtime.nowEpochSeconds() + 90,
        }),
        recordChallenge: runtime.sso.recordChallenge,
        nowEpochSeconds: runtime.nowEpochSeconds,
      })
    );
}

function validationHandler(runtime: SharedRuntime) {
  return async (sessionId: string, body: Record<string, unknown>, requesterIp: string) =>
    validationResponse(
      await validateSsoSession(sessionId, body, requesterIp, {
        loadSession: runtime.sso.loadSession,
        validateAttestation: attestationValidator(runtime),
        fetchProjection: runtime.fetchProjection,
        verifyProof: (input) => verifyValidationProof(runtime, input),
        mintApprovalToken: () => randomBytes(32).toString('base64url'),
        mintDeviceTrust: async (publicKey, keyId, ip) =>
          runtime.deviceTrust.mint(publicKey, keyId, ip),
        recordValidation: runtime.sso.recordValidation,
        nowEpochSeconds: runtime.nowEpochSeconds,
        approvalTtlSeconds: SSO_APPROVAL_TTL_SECONDS,
      })
    );
}

export function createSsoRuntime(runtime: SharedRuntime) {
  return {
    startSso: startHandler(runtime),
    challengeSso: challengeHandler(runtime),
    validateSso: validationHandler(runtime),
    redeemSsoApproval: createSsoApprovalRedemptionHandler({
      loadSession: runtime.sso.loadSession,
      consumeApproval: runtime.sso.consumeApproval,
    }),
    exchangeSsoApproval: createSsoApprovalExchangeHandler({
      loadSession: runtime.sso.loadSession,
      consumeApproval: runtime.sso.consumeApproval,
    }),
  };
}
