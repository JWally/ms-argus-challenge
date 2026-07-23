import { describe, expect, it, vi } from 'vitest';
import { isProofOfLifeSatisfied, verifyProofOfLife } from './proof-of-life.js';

describe('proof-of-life selection', () => {
  it('uses redeemed device trust before interactive proof', async () => {
    const verifyWebAuthn = vi.fn();
    const verifyOAuth = vi.fn();
    const proof = await verifyProofOfLife(
      { trustRedeemed: true, webauthn: null, oauth: { provider: 'google' } },
      { verifyWebAuthn, verifyOAuth }
    );
    expect(proof).toEqual({
      phone_webauthn_attested: true,
      phone_webauthn_user_verified: true,
      phone_webauthn_format: 'device_trust_redeem',
    });
    expect(verifyWebAuthn).not.toHaveBeenCalled();
    expect(verifyOAuth).not.toHaveBeenCalled();
  });

  it('uses OAuth when present and WebAuthn otherwise', async () => {
    const verifyWebAuthn = vi.fn().mockResolvedValue({ phone_webauthn_attested: false });
    const verifyOAuth = vi.fn().mockResolvedValue({
      phone_webauthn_attested: true,
      phone_webauthn_format: 'oauth_google',
    });
    await expect(
      verifyProofOfLife(
        { trustRedeemed: false, webauthn: null, oauth: { provider: 'google' } },
        { verifyWebAuthn, verifyOAuth }
      )
    ).resolves.toMatchObject({ phone_webauthn_format: 'oauth_google' });
    expect(verifyOAuth).toHaveBeenCalledWith({ provider: 'google' });

    await verifyProofOfLife(
      { trustRedeemed: false, webauthn: { id: 'credential' }, oauth: null },
      { verifyWebAuthn, verifyOAuth }
    );
    expect(verifyWebAuthn).toHaveBeenCalledWith({ id: 'credential' });
  });

  it('defines satisfaction by verified attestation, not proof presence', () => {
    expect(isProofOfLifeSatisfied({ phone_webauthn_attested: true })).toBe(true);
    expect(
      isProofOfLifeSatisfied({
        phone_webauthn_attested: false,
        phone_webauthn_error: 'present_but_invalid',
      })
    ).toBe(false);
  });
});
