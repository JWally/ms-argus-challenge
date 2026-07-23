import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createGoogleOidcVerifier } from './google-oidc.js';

const NOW = 1_900_000_000;

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fixtureToken(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const header = base64Url({ alg: 'RS256', kid: 'key-1' });
  const payload = base64Url({
    iss: 'https://accounts.google.com',
    aud: 'google-client-id',
    sub: 'subject-1',
    nonce: 'nonce-1',
    exp: NOW + 300,
    email_verified: true,
    ...overrides,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey).toString('base64url');
  return {
    token: `${header}.${payload}.${signature}`,
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [{ kid: 'key-1', n: jwk.n, e: jwk.e }] }), {
        status: 200,
      })
    ),
  };
}

describe('Google OIDC verifier', () => {
  it('fails closed when Google is unconfigured or the token is malformed', async () => {
    await expect(
      createGoogleOidcVerifier({ clientId: '', fetch, nowEpochSeconds: () => NOW }).verify(
        'token',
        'nonce-1'
      )
    ).resolves.toEqual({ ok: false, reason: 'google_not_configured' });
    await expect(
      createGoogleOidcVerifier({
        clientId: 'google-client-id',
        fetch,
        nowEpochSeconds: () => NOW,
      }).verify('token', 'nonce-1')
    ).resolves.toEqual({ ok: false, reason: 'malformed_jwt' });
  });

  it('verifies signature, issuer, audience, expiry, nonce, and subject', async () => {
    const fixture = fixtureToken();
    const verifier = createGoogleOidcVerifier({
      clientId: 'google-client-id',
      fetch: fixture.fetch,
      nowEpochSeconds: () => NOW,
    });
    await expect(verifier.verify(fixture.token, 'nonce-1')).resolves.toEqual({
      ok: true,
      provider: 'google',
      subject: 'subject-1',
      emailVerified: true,
      realUserHint: 'unknown',
    });
  });

  it('rejects a token from another session and caches JWKS', async () => {
    const fixture = fixtureToken();
    const verifier = createGoogleOidcVerifier({
      clientId: 'google-client-id',
      fetch: fixture.fetch,
      nowEpochSeconds: () => NOW,
    });
    await expect(verifier.verify(fixture.token, 'other-nonce')).resolves.toEqual({
      ok: false,
      reason: 'nonce_mismatch',
    });
    await verifier.verify(fixture.token, 'nonce-1');
    expect(fixture.fetch).toHaveBeenCalledOnce();
  });
});
