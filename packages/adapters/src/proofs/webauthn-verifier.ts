import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import {
  isVirtualAuthenticator,
  type PasskeyStore,
  type ProofOfLifeAnnotations,
} from '@argus-challenge/core';

export interface WebAuthnProofDependencies {
  expectedNonce: string;
  argusPublicKey: string;
  rpId: string;
  expectedOrigin: string;
  allowTestAuthenticators: boolean;
  passkeys: PasskeyStore;
  nowEpochSeconds(): number;
}

function readInput(
  input: unknown
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; annotations: ProofOfLifeAnnotations } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      annotations: { phone_webauthn_attested: false, phone_webauthn_error: 'missing' },
    };
  }
  const value = input as Record<string, unknown>;
  if (typeof value.error === 'string') {
    return {
      ok: false,
      annotations: {
        phone_webauthn_attested: false,
        phone_webauthn_error: value.error,
      },
    };
  }
  return { ok: true, value };
}

function toPublicKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  const source = Buffer.from(value, 'base64');
  const bytes = new Uint8Array(new ArrayBuffer(source.length));
  bytes.set(source);
  return bytes;
}

async function verifyAuthentication(
  input: AuthenticationResponseJSON,
  dependencies: WebAuthnProofDependencies
): Promise<ProofOfLifeAnnotations> {
  if (!input.id) {
    return {
      phone_webauthn_attested: false,
      phone_webauthn_error: 'missing_credential_id',
    };
  }
  const stored = await dependencies.passkeys.load(input.id);
  if (!stored) {
    return {
      phone_webauthn_attested: false,
      phone_webauthn_error: 'credential_not_registered',
    };
  }
  try {
    const credential: WebAuthnCredential = {
      id: stored.credentialId,
      publicKey: toPublicKeyBytes(stored.publicKey),
      counter: stored.signCount,
    };
    const verification = await verifyAuthenticationResponse({
      response: input,
      expectedChallenge: dependencies.expectedNonce,
      expectedOrigin: dependencies.expectedOrigin,
      expectedRPID: dependencies.rpId,
      credential,
      requireUserVerification: true,
    });
    if (!verification.verified) {
      return { phone_webauthn_attested: false, phone_webauthn_error: 'not_verified' };
    }
    await dependencies.passkeys.save({
      ...stored,
      signCount: verification.authenticationInfo.newCounter,
      argusPublicKey: dependencies.argusPublicKey,
      lastUsedAt: dependencies.nowEpochSeconds(),
    });
    return {
      phone_webauthn_attested: true,
      phone_webauthn_format: 'passkey_authentication',
      phone_webauthn_credential_id: stored.credentialId,
      phone_webauthn_user_verified: verification.authenticationInfo.userVerified,
      phone_webauthn_credential_backed_up: verification.authenticationInfo.credentialBackedUp,
    };
  } catch (error) {
    return {
      phone_webauthn_attested: false,
      phone_webauthn_error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function saveRegistration(
  dependencies: WebAuthnProofDependencies,
  credential: { id: string; publicKey: Uint8Array; counter: number }
): Promise<void> {
  const now = dependencies.nowEpochSeconds();
  await dependencies.passkeys
    .save({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      signCount: credential.counter,
      argusPublicKey: dependencies.argusPublicKey,
      createdAt: now,
      lastUsedAt: now,
    })
    .catch(() => undefined);
}

async function verifyRegistration(
  input: RegistrationResponseJSON,
  dependencies: WebAuthnProofDependencies
): Promise<ProofOfLifeAnnotations> {
  try {
    const verification = await verifyRegistrationResponse({
      response: input,
      expectedChallenge: dependencies.expectedNonce,
      expectedOrigin: dependencies.expectedOrigin,
      expectedRPID: dependencies.rpId,
      requireUserVerification: true,
    });
    const info = verification.registrationInfo;
    if (!verification.verified || !info) {
      return { phone_webauthn_attested: false, phone_webauthn_error: 'not_verified' };
    }
    const isVirtual = isVirtualAuthenticator(info.aaguid);
    if (isVirtual && !dependencies.allowTestAuthenticators) {
      return {
        phone_webauthn_attested: false,
        phone_webauthn_error: 'virtual_authenticator',
        phone_webauthn_virtual: true,
        phone_webauthn_aaguid: info.aaguid,
      };
    }
    if (info.credential?.id && info.credential.publicKey) {
      await saveRegistration(dependencies, info.credential);
    }
    return {
      phone_webauthn_attested: true,
      phone_webauthn_aaguid: info.aaguid,
      phone_webauthn_format: info.fmt,
      phone_webauthn_credential_id: info.credential?.id,
      phone_webauthn_credential_backed_up: info.credentialBackedUp,
      phone_webauthn_user_verified: info.userVerified,
      ...(isVirtual ? { phone_webauthn_virtual: true } : {}),
    };
  } catch (error) {
    return {
      phone_webauthn_attested: false,
      phone_webauthn_error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyWebAuthnProof(
  input: unknown,
  dependencies: WebAuthnProofDependencies
): Promise<ProofOfLifeAnnotations> {
  const read = readInput(input);
  if (!read.ok) return read.annotations;
  const response = read.value.response as Record<string, unknown> | undefined;
  const isAuthentication =
    typeof response?.signature === 'string' && typeof response.authenticatorData === 'string';
  return isAuthentication
    ? verifyAuthentication(input as AuthenticationResponseJSON, dependencies)
    : verifyRegistration(input as RegistrationResponseJSON, dependencies);
}
