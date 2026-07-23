import { MERCHANT_CHALLENGE_PATTERN } from '@argus-challenge/contracts';

export interface SsoMerchantBinding {
  merchantCallbackUrl?: string;
  merchantChallengeId?: string;
}

function parseMerchantChallenge(value: unknown): string | null {
  return typeof value === 'string' && MERCHANT_CHALLENGE_PATTERN.test(value) ? value : null;
}

function parseCallback(value: unknown, allowedOrigins: readonly string[]): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const callback = new URL(value);
    return callback.protocol === 'https:' &&
      !callback.username &&
      !callback.password &&
      !callback.hash &&
      allowedOrigins.includes(callback.origin)
      ? callback.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseSsoMerchantBinding(
  body: Record<string, unknown>,
  allowedOrigins: readonly string[]
): { ok: true; value: SsoMerchantBinding } | { ok: false } {
  const supplied = body.merchantCallbackUrl !== undefined || body.merchantChallengeId !== undefined;
  if (!supplied) return { ok: true, value: {} };
  const merchantCallbackUrl = parseCallback(body.merchantCallbackUrl, allowedOrigins);
  const merchantChallengeId = parseMerchantChallenge(body.merchantChallengeId);
  return merchantCallbackUrl && merchantChallengeId
    ? { ok: true, value: { merchantCallbackUrl, merchantChallengeId } }
    : { ok: false };
}

export function ssoFailureReturn(
  sessionId: string,
  cpi: string,
  binding: SsoMerchantBinding = {}
): string {
  if (binding.merchantCallbackUrl && binding.merchantChallengeId) {
    const callback = new URL(binding.merchantCallbackUrl);
    callback.searchParams.set('status', 'failed');
    callback.searchParams.set('session', sessionId);
    callback.searchParams.set('cpi', cpi);
    callback.searchParams.set('challengeId', binding.merchantChallengeId);
    return callback.toString();
  }
  const parameters = new URLSearchParams({
    complete: '1',
    session: sessionId,
    cpi,
    status: 'failed',
  });
  return `/merchant?${parameters.toString()}`;
}
