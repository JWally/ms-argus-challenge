import type { AttestationInput } from '../attestations/attestation-bindings.js';
import { isProofOfLifeSatisfied, type ProofOfLifeAnnotations } from '../proofs/proof-of-life.js';
import type { SsoValidationProofResult } from './validation.js';

interface SsoValidationProofInput {
  body: Record<string, unknown>;
  requesterIp: string;
  attestation: AttestationInput;
  nonce: string;
  proofRequired: boolean;
  freshProofRequired: boolean;
}

interface ValidationProofDependencies {
  verifyDeviceTrust(
    token: string,
    requesterIp: string,
    publicKey: string
  ): Promise<{ ok: boolean; reason?: string; ipChanged?: boolean }>;
  verifyProofOfLife(input: {
    webauthn: unknown;
    oauth: unknown;
    expectedNonce: string;
    argusPublicKey: string;
    trustRedeemed: boolean;
  }): Promise<ProofOfLifeAnnotations>;
}

export async function verifySsoValidationProof(
  input: SsoValidationProofInput,
  dependencies: ValidationProofDependencies
): Promise<SsoValidationProofResult> {
  const token =
    typeof input.body.deviceTrustToken === 'string' ? input.body.deviceTrustToken : undefined;
  if (input.freshProofRequired && token) {
    return { ok: false, status: 401, body: { error: 'fresh_proof_required' } };
  }
  const trust = token
    ? await dependencies.verifyDeviceTrust(token, input.requesterIp, input.attestation.publicKey)
    : null;
  if (trust && !trust.ok) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'device_trust_rejected',
        reason: trust.reason ?? 'invalid',
        clearDeviceTrust: true,
      },
    };
  }
  const trustRedeemed = trust?.ok === true;
  const proof = await dependencies.verifyProofOfLife({
    webauthn: input.body.webauthn,
    oauth: input.body.oauth,
    expectedNonce: input.nonce,
    argusPublicKey: input.attestation.publicKey,
    trustRedeemed,
  });
  const annotations = {
    ...proof,
    ...(trustRedeemed ? { phone_device_trust_redeemed: true } : {}),
    ...(trust?.ipChanged ? { phone_device_trust_ip_changed: true } : {}),
  };
  if (input.proofRequired && !isProofOfLifeSatisfied(proof)) {
    return {
      ok: false,
      status: 401,
      body: { error: 'proof_of_life_required', annotations },
    };
  }
  return { ok: true, annotations, trustRedeemed };
}
