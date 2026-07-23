import { createPublicKey, createVerify, type JsonWebKeyInput } from 'node:crypto';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const JWKS_TTL_SECONDS = 60 * 60;

export type GoogleOidcResult =
  | {
      ok: true;
      provider: 'google';
      subject: string;
      emailVerified: boolean;
      realUserHint: 'unknown';
    }
  | { ok: false; reason: string };

interface GoogleHeader {
  alg?: string;
  kid?: string;
}

interface GoogleClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  nonce?: string;
  exp?: number;
  email_verified?: boolean;
}

interface GoogleVerifierConfig {
  clientId: string;
  fetch: typeof fetch;
  nowEpochSeconds(): number;
}

interface ParsedToken {
  signed: string;
  signature: string;
  header: GoogleHeader;
  claims: GoogleClaims;
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function readJwks(value: unknown): { keys: { kid: string; n: string; e: string }[] } | null {
  if (!value || typeof value !== 'object' || !('keys' in value)) return null;
  const rawKeys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(rawKeys)) return null;
  const keys = (rawKeys as unknown[]).filter(
    (key): key is { kid: string; n: string; e: string } => {
      if (!key || typeof key !== 'object') return false;
      const candidate = key as Record<string, unknown>;
      return (
        typeof candidate.kid === 'string' &&
        typeof candidate.n === 'string' &&
        typeof candidate.e === 'string'
      );
    }
  );
  return { keys };
}

function createKeyCache(config: GoogleVerifierConfig) {
  let cache: { expiresAt: number; publicKeys: Map<string, string> } | null = null;
  return async (): Promise<Map<string, string>> => {
    const now = config.nowEpochSeconds();
    if (cache && cache.expiresAt > now) return cache.publicKeys;
    const response = await config.fetch(GOOGLE_JWKS_URL);
    if (!response.ok) throw new Error('jwks_fetch_failed');
    const jwks = readJwks((await response.json()) as unknown);
    if (!jwks) throw new Error('jwks_invalid');
    const publicKeys = new Map<string, string>();
    for (const key of jwks.keys) {
      const publicKey = createPublicKey({
        key: { kty: 'RSA', n: key.n, e: key.e },
        format: 'jwk',
      } satisfies JsonWebKeyInput);
      publicKeys.set(key.kid, publicKey.export({ type: 'spki', format: 'pem' }).toString());
    }
    cache = { expiresAt: now + JWKS_TTL_SECONDS, publicKeys };
    return publicKeys;
  };
}

function parseToken(token: string): ParsedToken | { reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { reason: 'malformed_jwt' };
  const [headerEncoded, claimsEncoded, signature] = parts;
  if (!headerEncoded || !claimsEncoded || !signature) return { reason: 'malformed_jwt' };
  const header = decodeJson<GoogleHeader>(headerEncoded);
  const claims = decodeJson<GoogleClaims>(claimsEncoded);
  if (!header || !claims) return { reason: 'jwt_parse_failed' };
  if (header.alg !== 'RS256') return { reason: 'unsupported_alg' };
  if (!header.kid) return { reason: 'missing_kid' };
  return { signed: `${headerEncoded}.${claimsEncoded}`, signature, header, claims };
}

async function signatureFailure(
  token: ParsedToken,
  publicKeys: () => Promise<Map<string, string>>
): Promise<string | null> {
  let keys: Map<string, string>;
  try {
    keys = await publicKeys();
  } catch {
    return 'jwks_unavailable';
  }
  const publicKey = keys.get(token.header.kid ?? '');
  if (!publicKey) return 'unknown_kid';
  const verifier = createVerify('RSA-SHA256');
  verifier.update(token.signed);
  return verifier.verify(publicKey, Buffer.from(token.signature, 'base64url'))
    ? null
    : 'signature_invalid';
}

function claimsFailure(
  claims: GoogleClaims,
  expectedNonce: string,
  config: GoogleVerifierConfig
): string | null {
  if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) return 'wrong_issuer';
  if (claims.aud !== config.clientId) return 'aud_mismatch';
  if (typeof claims.exp !== 'number' || config.nowEpochSeconds() > claims.exp) return 'expired';
  if (claims.nonce !== expectedNonce) return 'nonce_mismatch';
  return claims.sub ? null : 'missing_subject';
}

export function createGoogleOidcVerifier(config: GoogleVerifierConfig) {
  const publicKeys = createKeyCache(config);
  return {
    async verify(token: string, expectedNonce: string): Promise<GoogleOidcResult> {
      if (!config.clientId) return { ok: false, reason: 'google_not_configured' };
      const parsed = parseToken(token);
      if ('reason' in parsed) return { ok: false, reason: parsed.reason };
      const failure =
        (await signatureFailure(parsed, publicKeys)) ??
        claimsFailure(parsed.claims, expectedNonce, config);
      if (failure) return { ok: false, reason: failure };
      return {
        ok: true,
        provider: 'google',
        subject: parsed.claims.sub ?? '',
        emailVerified: parsed.claims.email_verified === true,
        realUserHint: 'unknown',
      };
    },
  };
}
