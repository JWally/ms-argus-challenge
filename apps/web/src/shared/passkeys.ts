const HINT_KEY = 'argus-challenge:passkey-id';

function optionsBase(nonce: string) {
  return { challenge: nonce, timeout: 60_000 };
}

function rememberedCredential(): string | null {
  try {
    return localStorage.getItem(HINT_KEY);
  } catch {
    return null;
  }
}

function rememberCredential(value: unknown): void {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : null;
  if (typeof id !== 'string') return;
  try {
    localStorage.setItem(HINT_KEY, id);
  } catch {
    // Persistence is an optional fast path.
  }
}

export async function proveWithPasskey(nonce: string): Promise<unknown> {
  const { startAuthentication, startRegistration } = await import('@simplewebauthn/browser');
  const credentialId = rememberedCredential();
  if (credentialId) {
    try {
      return await startAuthentication({
        optionsJSON: {
          ...optionsBase(nonce),
          rpId: window.location.hostname,
          userVerification: 'required',
          allowCredentials: [{ id: credentialId, type: 'public-key' }],
        },
      });
    } catch {
      localStorage.removeItem(HINT_KEY);
    }
  }
  const response = await startRegistration({
    optionsJSON: {
      ...optionsBase(nonce),
      rp: { id: window.location.hostname, name: 'Argus Challenge' },
      user: {
        id: btoa(window.location.hostname).replaceAll('+', '-').replaceAll('/', '_'),
        name: 'challenge-user',
        displayName: 'Argus Challenge',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'required',
      },
      attestation: 'none',
    },
  });
  rememberCredential(response);
  return response;
}
