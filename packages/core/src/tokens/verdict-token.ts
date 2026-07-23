import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VerdictClaims } from '@argus-challenge/contracts';

export const VERDICT_TOKEN_TTL_SECONDS = 300;

export type VerifyVerdictResult =
  { ok: true; claims: VerdictClaims } | { ok: false; reason: string };

function createMac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest().toString('base64url');
}

function hasValidSignature(secret: string, payload: string, receivedMac: string): boolean {
  const expected = Buffer.from(createMac(secret, payload));
  const received = Buffer.from(receivedMac);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function decodeClaims(payload: string): VerdictClaims | null {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as VerdictClaims;
  } catch {
    return null;
  }
}

function validateClaims(claims: VerdictClaims, nowSeconds: number): string | null {
  if (
    typeof claims.sessionId !== 'string' ||
    typeof claims.challengeId !== 'string' ||
    typeof claims.verdict !== 'string'
  ) {
    return 'bad_claims';
  }
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) return 'expired';
  if (typeof claims.iat !== 'number' || claims.iat > nowSeconds + 60) return 'future';
  return null;
}

export function signVerdict(
  secret: string,
  input: Omit<VerdictClaims, 'iat' | 'exp'>,
  nowMilliseconds: number = Date.now()
): string {
  const iat = Math.floor(nowMilliseconds / 1000);
  const claims: VerdictClaims = { ...input, iat, exp: iat + VERDICT_TOKEN_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${createMac(secret, payload)}`;
}

export function verifyVerdictToken(
  secret: string,
  token: string,
  nowMilliseconds: number = Date.now()
): VerifyVerdictResult {
  const separator = token.indexOf('.');
  if (separator < 1 || separator === token.length - 1) {
    return { ok: false, reason: 'malformed' };
  }
  const payload = token.slice(0, separator);
  const receivedMac = token.slice(separator + 1);
  if (!hasValidSignature(secret, payload, receivedMac)) {
    return { ok: false, reason: 'bad_signature' };
  }
  const claims = decodeClaims(payload);
  if (!claims) return { ok: false, reason: 'bad_payload' };
  const invalidReason = validateClaims(claims, Math.floor(nowMilliseconds / 1000));
  return invalidReason ? { ok: false, reason: invalidReason } : { ok: true, claims };
}

export function verifyVerdictForContext(
  secret: string,
  token: string,
  expected: { cpi: string; challengeId: string },
  nowMilliseconds: number = Date.now()
): VerifyVerdictResult {
  const verified = verifyVerdictToken(secret, token, nowMilliseconds);
  if (!verified.ok) return verified;
  if (verified.claims.cpi !== expected.cpi) return { ok: false, reason: 'cpi_mismatch' };
  if (verified.claims.challengeId !== expected.challengeId) {
    return { ok: false, reason: 'challenge_mismatch' };
  }
  return verified;
}
