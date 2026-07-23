import { describe, expect, it, vi } from 'vitest';
import { verifySsoValidationProof } from './validation-proof.js';

const input = {
  body: { webauthn: { id: 'credential' } },
  requesterIp: '203.0.113.8',
  attestation: {
    envelope: 'envelope',
    signature: 'signature',
    publicKey: 'phone-public-key',
    keyId: 'phone-key-id',
  },
  nonce: 'nonce-1',
  proofRequired: true,
  freshProofRequired: false,
};

describe('SSO validation proof', () => {
  it('passes verified WebAuthn and binds inputs to nonce and Argus key', async () => {
    const verifyProofOfLife = vi.fn().mockResolvedValue({ phone_webauthn_attested: true });
    await expect(
      verifySsoValidationProof(input, {
        verifyDeviceTrust: vi.fn(),
        verifyProofOfLife,
      })
    ).resolves.toEqual({
      ok: true,
      annotations: { phone_webauthn_attested: true },
      trustRedeemed: false,
    });
    expect(verifyProofOfLife).toHaveBeenCalledWith({
      webauthn: { id: 'credential' },
      oauth: undefined,
      expectedNonce: 'nonce-1',
      argusPublicKey: 'phone-public-key',
      trustRedeemed: false,
    });
  });

  it('rejects trust on force-auth and rejects invalid trust with a clear hint', async () => {
    await expect(
      verifySsoValidationProof(
        {
          ...input,
          freshProofRequired: true,
          body: { deviceTrustToken: 'trust' },
        },
        { verifyDeviceTrust: vi.fn(), verifyProofOfLife: vi.fn() }
      )
    ).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: 'fresh_proof_required' },
    });
    await expect(
      verifySsoValidationProof(
        { ...input, body: { deviceTrustToken: 'trust' } },
        {
          verifyDeviceTrust: vi.fn().mockResolvedValue({ ok: false, reason: 'expired' }),
          verifyProofOfLife: vi.fn(),
        }
      )
    ).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: 'device_trust_rejected', reason: 'expired', clearDeviceTrust: true },
    });
  });

  it('fails closed when required proof is absent', async () => {
    await expect(
      verifySsoValidationProof(input, {
        verifyDeviceTrust: vi.fn(),
        verifyProofOfLife: vi.fn().mockResolvedValue({
          phone_webauthn_attested: false,
          phone_webauthn_error: 'cancelled',
        }),
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 401,
      body: { error: 'proof_of_life_required' },
    });
  });
});
