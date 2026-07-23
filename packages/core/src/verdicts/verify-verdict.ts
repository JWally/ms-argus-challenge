import { MERCHANT_CHALLENGE_PATTERN } from '@argus-challenge/contracts';
import { parseScopedCpi } from '../assurance/scoped-cpi.js';
import type { ApplicationResponse } from '../http/application-response.js';
import { verifyVerdictForContext } from '../tokens/verdict-token.js';

interface VerdictSecretProvider {
  get(): Promise<string | null>;
}

export interface VerifyVerdictDependencies {
  verdictSecret: VerdictSecretProvider;
}

type VerifyResponse = ApplicationResponse<Record<string, unknown>>;

function validateContext(body: Record<string, unknown>): VerifyResponse | null {
  if (typeof body.token !== 'string') {
    return { status: 400, body: { error: 'missing_token' } };
  }
  if (body.cpi === undefined) return { status: 400, body: { error: 'missing_cpi' } };
  if (!parseScopedCpi(body.cpi)) return { status: 400, body: { error: 'invalid_cpi' } };
  if (body.challengeId === undefined) {
    return { status: 400, body: { error: 'missing_challenge_id' } };
  }
  if (typeof body.challengeId !== 'string' || !MERCHANT_CHALLENGE_PATTERN.test(body.challengeId)) {
    return { status: 400, body: { error: 'invalid_challenge_id' } };
  }
  return null;
}

export async function verifyVerdict(
  body: Record<string, unknown>,
  dependencies: VerifyVerdictDependencies
): Promise<VerifyResponse> {
  const validationFailure = validateContext(body);
  if (validationFailure) return validationFailure;
  const token = body.token as string;
  const scopedCpi = parseScopedCpi(body.cpi)!;
  const challengeId = body.challengeId as string;
  const secret = await dependencies.verdictSecret.get();
  if (!secret) return { status: 503, body: { error: 'verdict_signing_unconfigured' } };
  const verified = verifyVerdictForContext(secret, token, {
    cpi: scopedCpi.cpi,
    challengeId,
  });
  if (!verified.ok) return { status: 200, body: { valid: false, reason: verified.reason } };
  return {
    status: 200,
    body: {
      valid: true,
      passed: verified.claims.verdict === 'paired',
      cpi: verified.claims.cpi,
      challengeId: verified.claims.challengeId,
      sessionId: verified.claims.sessionId,
      verdict: verified.claims.verdict,
      reason: verified.claims.reason,
      iat: verified.claims.iat,
      exp: verified.claims.exp,
    },
  };
}
