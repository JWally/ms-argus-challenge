import type { MerchantProjection } from '@argus-challenge/contracts';
import { ssoFailureReturn } from './merchant-binding.js';
import { profileFromProjection, requirePhoneProfile } from './profile.js';
import { hashSsoReturnCode } from './token-hash.js';
import type { SsoAttestationResult, SsoSession, StoredSsoChallenge } from './types.js';

export interface SsoChallengeDependencies {
  loadSession(sessionId: string): Promise<SsoSession | null>;
  validateAttestation(
    body: Record<string, unknown>,
    expected: {
      role: 'argus-challenge';
      sessionId: string;
      nonce: string;
      cpi: string;
    }
  ): SsoAttestationResult;
  fetchProjection(argusSessionId: string): Promise<MerchantProjection | null>;
  mintReturnCode(): { value: string; expiresAt: number };
  recordChallenge(challenge: StoredSsoChallenge): Promise<boolean>;
  nowEpochSeconds(): number;
}

type ChallengeResult =
  | {
      ok: true;
      sessionId: string;
      returnCode: string;
      cpi: string;
      hasMerchantCallback: boolean;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function challengeSsoSession(
  sessionId: string,
  body: Record<string, unknown>,
  dependencies: SsoChallengeDependencies
): Promise<ChallengeResult> {
  const session = await dependencies.loadSession(sessionId);
  if (!session || session.expiresAt < dependencies.nowEpochSeconds()) {
    return { ok: false, status: 404, body: { error: 'sso_session_not_found' } };
  }
  if (session.challengeProfile) {
    return { ok: false, status: 409, body: { error: 'sso_challenge_already_completed' } };
  }
  const checked = dependencies.validateAttestation(body, {
    role: 'argus-challenge',
    sessionId,
    nonce: session.nonce,
    cpi: session.cpi,
  });
  if (!checked.ok) return checked;
  const argusSessionId = String(body.argusSessionId);
  const profile = profileFromProjection(
    argusSessionId,
    checked.attestation,
    await dependencies.fetchProjection(argusSessionId)
  );
  const phone = requirePhoneProfile(
    profile,
    'challenge',
    ssoFailureReturn(sessionId, session.cpi, session)
  );
  if (!phone.ok) return phone;
  const code = dependencies.mintReturnCode();
  const stored = await dependencies.recordChallenge({
    sessionId,
    challengeProfile: profile,
    returnCodeHash: hashSsoReturnCode(code.value),
    returnCodeExpiresAt: code.expiresAt,
  });
  if (!stored) {
    return { ok: false, status: 409, body: { error: 'sso_challenge_already_completed' } };
  }
  return {
    ok: true,
    sessionId,
    returnCode: code.value,
    cpi: session.cpi,
    hasMerchantCallback: Boolean(session.merchantCallbackUrl),
  };
}
