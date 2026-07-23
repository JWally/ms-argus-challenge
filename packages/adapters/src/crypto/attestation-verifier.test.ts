import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAttestationVerifier } from './attestation-verifier.js';

const NOW = 1_900_000_000;

function signedAttestation(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  const keyId = createHash('sha256').update(publicKeyDer).digest('hex').slice(0, 16);
  const envelope = Buffer.from(
    JSON.stringify({
      v: 1,
      purpose: 'argus-pair-v1',
      payload: { sessionId: 'session-1', nonce: 'nonce-1', role: 'phone' },
      scanSessionId: 'argus-1',
      iat: NOW - 1,
      exp: NOW + 60,
      keyId,
      ...overrides,
    })
  ).toString('base64url');
  const signer = createSign('SHA256');
  signer.update(envelope, 'utf8');
  return {
    envelope,
    signature: signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64'),
    publicKey: publicKeyDer.toString('base64'),
    keyId,
  };
}

describe('Argus attestation verifier', () => {
  it('verifies the current signed-envelope format', () => {
    expect(createAttestationVerifier(() => NOW).verify(signedAttestation())).toMatchObject({
      ok: true,
      decoded: {
        purpose: 'argus-pair-v1',
        scanSessionId: 'argus-1',
        payload: { role: 'phone' },
      },
    });
  });

  it.each([
    [{ purpose: 'other-purpose' }, 'envelope_purpose_mismatch'],
    [{ iat: NOW + 31 }, 'envelope_not_yet_valid'],
    [{ exp: NOW - 31 }, 'envelope_expired'],
  ])('rejects envelope policy %#', (override, reason) => {
    expect(createAttestationVerifier(() => NOW).verify(signedAttestation(override))).toEqual({
      ok: false,
      reason,
    });
  });

  it('rejects key substitution and signature tampering', () => {
    const verifier = createAttestationVerifier(() => NOW);
    expect(verifier.verify({ ...signedAttestation(), keyId: 'wrong' })).toEqual({
      ok: false,
      reason: 'keyId_mismatch',
    });
    const attestation = signedAttestation();
    const replacement = attestation.signature.startsWith('A') ? 'B' : 'A';
    expect(
      verifier.verify({
        ...attestation,
        signature: `${replacement}${attestation.signature.slice(1)}`,
      })
    ).toEqual({
      ok: false,
      reason: 'signature_verify_failed',
    });
  });
});
