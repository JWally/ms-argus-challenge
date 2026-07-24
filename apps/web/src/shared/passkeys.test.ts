import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proveWithPasskey } from './passkeys.js';

const webauthn = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => webauthn);

function localStorageStub(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

beforeEach(() => {
  webauthn.startAuthentication.mockReset();
  webauthn.startRegistration.mockReset();
  vi.stubGlobal('localStorage', localStorageStub());
  vi.stubGlobal('window', { location: { hostname: 'challenge.example' } });
});

afterEach(() => vi.unstubAllGlobals());

describe('passkey discovery', () => {
  it('asks the authenticator for a discoverable credential without a local hint', async () => {
    const credential = { id: 'synced-passkey' };
    webauthn.startAuthentication.mockResolvedValue(credential);

    await expect(proveWithPasskey('proof-nonce')).resolves.toBe(credential);

    const request = webauthn.startAuthentication.mock.calls[0]?.[0];
    expect(request?.optionsJSON).toMatchObject({
      challenge: 'proof-nonce',
      rpId: 'challenge.example',
      userVerification: 'required',
    });
    expect(request?.optionsJSON).not.toHaveProperty('allowCredentials');
    expect(webauthn.startRegistration).not.toHaveBeenCalled();
  });

  it('creates a discoverable passkey only after credential discovery fails', async () => {
    const credential = { id: 'new-passkey' };
    webauthn.startAuthentication.mockRejectedValue(new Error('credential_not_available'));
    webauthn.startRegistration.mockResolvedValue(credential);

    await expect(proveWithPasskey('proof-nonce')).resolves.toBe(credential);

    expect(webauthn.startAuthentication).toHaveBeenCalledOnce();
    expect(webauthn.startRegistration).toHaveBeenCalledWith({
      optionsJSON: expect.objectContaining({
        authenticatorSelection: expect.objectContaining({
          residentKey: 'required',
          requireResidentKey: true,
        }),
      }),
    });
  });
});
