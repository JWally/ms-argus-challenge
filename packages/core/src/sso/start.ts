import type { MerchantProjection } from '@argus-challenge/contracts';
import { parseScopedCpi, requiresProofOfLife } from '../assurance/scoped-cpi.js';
import { parseSsoMerchantBinding, ssoFailureReturn } from './merchant-binding.js';
import { profileFromProjection, requirePhoneProfile } from './profile.js';
import type { SsoAttestationResult, SsoSession } from './types.js';

export interface SsoStartDependencies {
  callbackOrigins: readonly string[];
  validateAttestation(
    body: Record<string, unknown>,
    expected: { role: 'merchant-start'; cpi: string }
  ): SsoAttestationResult;
  fetchProjection(argusSessionId: string): Promise<MerchantProjection | null>;
  createSession(session: SsoSession): Promise<boolean>;
  newSessionId(): string;
  newNonce(): string;
  newMerchantSessionId(): string;
  nowEpochSeconds(): number;
  sessionTtlSeconds: number;
  proofRequiredByDefault: boolean;
}

export type SsoStartResult =
  | { ok: true; sessionId: string; session: SsoSession; failureReturnUrl: string }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function startSsoSession(
  body: Record<string, unknown>,
  dependencies: SsoStartDependencies
): Promise<SsoStartResult> {
  if (body.cpi === undefined) {
    return { ok: false, status: 400, body: { error: 'missing_cpi' } };
  }
  const scoped = parseScopedCpi(body.cpi);
  if (!scoped) return { ok: false, status: 400, body: { error: 'invalid_cpi' } };
  const checked = dependencies.validateAttestation(body, {
    role: 'merchant-start',
    cpi: scoped.cpi,
  });
  if (!checked.ok) return checked;
  const binding = parseSsoMerchantBinding(body, dependencies.callbackOrigins);
  if (!binding.ok) {
    return { ok: false, status: 400, body: { error: 'invalid_sso_merchant_binding' } };
  }
  const sessionId = dependencies.newSessionId();
  const failureReturnUrl = ssoFailureReturn(sessionId, scoped.cpi, binding.value);
  const argusSessionId = String(body.argusSessionId);
  const profile = profileFromProjection(
    argusSessionId,
    checked.attestation,
    await dependencies.fetchProjection(argusSessionId)
  );
  const phone = requirePhoneProfile(profile, 'start', failureReturnUrl);
  if (!phone.ok) return phone;
  const merchantSessionId =
    typeof body.merchantSessionId === 'string' && body.merchantSessionId
      ? body.merchantSessionId.slice(0, 128)
      : dependencies.newMerchantSessionId();
  const session: SsoSession = {
    id: sessionId,
    nonce: dependencies.newNonce(),
    merchantSessionId,
    cpi: scoped.cpi,
    ...binding.value,
    proofRequired: requiresProofOfLife(scoped, dependencies.proofRequiredByDefault),
    freshProofRequired: scoped.freshProofRequired,
    startProfile: profile,
    verdict: 'pending',
    expiresAt: dependencies.nowEpochSeconds() + dependencies.sessionTtlSeconds,
  };
  if (!(await dependencies.createSession(session))) {
    return { ok: false, status: 409, body: { error: 'sso_session_collision' } };
  }
  return { ok: true, sessionId, session, failureReturnUrl };
}
