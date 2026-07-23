import { verifyWebAuthnProof } from '@argus-challenge/adapters';
import { verifyProofOfLife, type ProofOfLifeAnnotations } from '@argus-challenge/core';
import type { SharedRuntime } from './shared-runtime.js';

function readGoogleInput(value: unknown): { token: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return input.provider === 'google' && typeof input.token === 'string' && input.token
    ? { token: input.token }
    : null;
}

async function verifyGoogleProof(
  runtime: SharedRuntime,
  value: unknown,
  nonce: string
): Promise<ProofOfLifeAnnotations> {
  const input = readGoogleInput(value);
  if (!input) {
    return { phone_webauthn_attested: false, phone_oauth_error: 'missing_or_malformed' };
  }
  const result = await runtime.googleOidc.verify(input.token, nonce);
  return result.ok
    ? {
        phone_webauthn_attested: true,
        phone_webauthn_user_verified: true,
        phone_webauthn_format: 'oauth_google',
        phone_oauth_provider: 'google',
        phone_oauth_subject: result.subject,
        phone_oauth_email_verified: result.emailVerified,
        phone_oauth_real_user_hint: result.realUserHint,
      }
    : {
        phone_webauthn_attested: false,
        phone_oauth_provider: 'google',
        phone_oauth_error: result.reason,
      };
}

export function verifyPhoneProof(
  runtime: SharedRuntime,
  input: {
    webauthn: unknown;
    oauth: unknown;
    expectedNonce: string;
    argusPublicKey: string;
    trustRedeemed: boolean;
  }
) {
  return verifyProofOfLife(
    { webauthn: input.webauthn, oauth: input.oauth, trustRedeemed: input.trustRedeemed },
    {
      verifyWebAuthn: (webauthn) =>
        verifyWebAuthnProof(webauthn, {
          expectedNonce: input.expectedNonce,
          argusPublicKey: input.argusPublicKey,
          rpId: new URL(runtime.config.publicOrigin).hostname,
          expectedOrigin: runtime.config.publicOrigin,
          allowTestAuthenticators: runtime.config.allowTestAuthenticators,
          passkeys: runtime.passkeys,
          nowEpochSeconds: runtime.nowEpochSeconds,
        }),
      verifyOAuth: (oauth) => verifyGoogleProof(runtime, oauth, input.expectedNonce),
    }
  );
}
