import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { verifyWebAuthnProof } from './webauthn-verifier.js';

vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    expectedNonce: 'nonce-1',
    argusPublicKey: 'argus-public-key',
    rpId: 'challenge.example',
    expectedOrigin: 'https://challenge.example',
    allowTestAuthenticators: false,
    passkeys: {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    },
    nowEpochSeconds: () => 1_900_000_000,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('WebAuthn proof verifier', () => {
  it('reports missing and client-side proof errors without library calls', async () => {
    await expect(verifyWebAuthnProof(null, dependencies())).resolves.toEqual({
      phone_webauthn_attested: false,
      phone_webauthn_error: 'missing',
    });
    await expect(verifyWebAuthnProof({ error: 'not_allowed' }, dependencies())).resolves.toEqual({
      phone_webauthn_attested: false,
      phone_webauthn_error: 'not_allowed',
    });
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
  });

  it('rejects assertions for credentials this service never registered', async () => {
    await expect(
      verifyWebAuthnProof(
        {
          id: 'unknown-credential',
          response: { signature: 'signature', authenticatorData: 'authenticator-data' },
        },
        dependencies()
      )
    ).resolves.toEqual({
      phone_webauthn_attested: false,
      phone_webauthn_error: 'credential_not_registered',
    });
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('rejects the known Chromium virtual authenticator outside test mode', async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        fmt: 'none',
        aaguid: '01020304-0506-0708-0102-030405060708',
        credential: { id: 'credential', publicKey: new Uint8Array([1]), counter: 0 },
        credentialType: 'public-key',
        attestationObject: new Uint8Array(),
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://challenge.example',
        rpID: 'challenge.example',
      },
    } as never);
    await expect(verifyWebAuthnProof({ id: 'credential' }, dependencies())).resolves.toMatchObject({
      phone_webauthn_attested: false,
      phone_webauthn_error: 'virtual_authenticator',
      phone_webauthn_virtual: true,
    });
  });
});
