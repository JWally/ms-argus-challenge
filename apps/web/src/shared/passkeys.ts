const PASSKEY_CREDENTIAL_KEY = 'argus-challenge:passkey-id';
const PASSKEY_TIMEOUT_MS = 60_000;

function storageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removePasskeyHint(): void {
  try {
    localStorage.removeItem(PASSKEY_CREDENTIAL_KEY);
  } catch {
    // Hints are optional; server verification remains authoritative.
  }
}

export function rememberPasskeyCredential(value: unknown): void {
  const credentialId =
    value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined;
  if (typeof credentialId !== 'string') return;
  try {
    localStorage.setItem(PASSKEY_CREDENTIAL_KEY, credentialId);
  } catch {
    // A credential remains usable without the local presentation hint.
  }
}

function baseOptions(nonce: string) {
  return { challenge: nonce, timeout: PASSKEY_TIMEOUT_MS };
}

function encodedUserId(hostname: string): string {
  return btoa(hostname).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function clearPasskeyHint(): void {
  removePasskeyHint();
}

export async function authenticateExistingPasskey(nonce: string): Promise<unknown> {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const credentialId = storageValue(PASSKEY_CREDENTIAL_KEY);
  try {
    return await startAuthentication({
      optionsJSON: {
        ...baseOptions(nonce),
        rpId: window.location.hostname,
        userVerification: 'required',
        ...(credentialId
          ? { allowCredentials: [{ id: credentialId, type: 'public-key' as const }] }
          : {}),
      },
    });
  } catch (error) {
    removePasskeyHint();
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createNewPasskey(nonce: string): Promise<unknown> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  try {
    const response = await startRegistration({
      optionsJSON: {
        ...baseOptions(nonce),
        rp: { id: window.location.hostname, name: 'Argus Pair' },
        user: {
          id: encodedUserId(window.location.hostname),
          name: 'pair',
          displayName: 'Argus Pair',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          requireResidentKey: true,
          userVerification: 'required',
        },
        attestation: 'none',
      },
    });
    return response;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function proveWithPasskey(nonce: string): Promise<unknown> {
  const authentication = await authenticateExistingPasskey(nonce);
  if (authentication && typeof authentication === 'object' && !('error' in authentication)) {
    return authentication;
  }
  return createNewPasskey(nonce);
}
