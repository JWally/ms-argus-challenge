export interface ProofOfLifeAnnotations extends Record<string, unknown> {
  phone_webauthn_attested: boolean;
  phone_webauthn_aaguid?: string;
  phone_webauthn_format?: string;
  phone_webauthn_credential_id?: string;
  phone_webauthn_credential_backed_up?: boolean;
  phone_webauthn_user_verified?: boolean;
  phone_webauthn_virtual?: boolean;
  phone_webauthn_error?: string;
  phone_oauth_provider?: 'google';
  phone_oauth_subject?: string;
  phone_oauth_email_verified?: boolean;
  phone_oauth_real_user_hint?: 'likely_real' | 'unknown' | 'unsupported';
  phone_oauth_error?: string;
}

export interface ProofOfLifeInput {
  trustRedeemed: boolean;
  webauthn: unknown;
  oauth: unknown;
}

export interface ProofOfLifeDependencies {
  verifyWebAuthn(input: unknown): Promise<ProofOfLifeAnnotations>;
  verifyOAuth(input: unknown): Promise<ProofOfLifeAnnotations>;
}

export function isProofOfLifeSatisfied(annotations: ProofOfLifeAnnotations): boolean {
  return annotations.phone_webauthn_attested === true;
}

export async function verifyProofOfLife(
  input: ProofOfLifeInput,
  dependencies: ProofOfLifeDependencies
): Promise<ProofOfLifeAnnotations> {
  if (input.trustRedeemed) {
    return {
      phone_webauthn_attested: true,
      phone_webauthn_user_verified: true,
      phone_webauthn_format: 'device_trust_redeem',
    };
  }
  return input.oauth
    ? dependencies.verifyOAuth(input.oauth)
    : dependencies.verifyWebAuthn(input.webauthn);
}
