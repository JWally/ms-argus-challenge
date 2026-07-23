import type { AttestationInput } from '../attestations/attestation-bindings.js';
import type { SsoLegProfile } from './continuity.js';
import type { SsoMerchantBinding } from './merchant-binding.js';

export interface SsoSession extends SsoMerchantBinding {
  id: string;
  nonce: string;
  merchantSessionId: string;
  cpi: string;
  proofRequired: boolean;
  freshProofRequired: boolean;
  startProfile: SsoLegProfile;
  challengeProfile?: SsoLegProfile;
  validateProfile?: SsoLegProfile;
  returnCodeHash?: string;
  returnCodeExpiresAt?: number;
  returnCodeConsumedAt?: number;
  approvalTokenHash?: string;
  approvalRedeemedAt?: number;
  verdict: 'pending' | 'approved' | 'failed';
  verdictReason?: string;
  expiresAt: number;
  approvedAt?: number;
}

export type SsoAttestationResult =
  | { ok: true; attestation: AttestationInput }
  | { ok: false; status: number; body: Record<string, unknown> };

export interface StoredSsoChallenge {
  sessionId: string;
  challengeProfile: SsoLegProfile;
  returnCodeHash: string;
  returnCodeExpiresAt: number;
}

export interface StoredSsoValidation {
  sessionId: string;
  validateProfile: SsoLegProfile;
  verdict: 'approved' | 'failed';
  verdictReason: string;
  returnCodeConsumedAt: number;
  proofAnnotations: Record<string, unknown>;
  approval?: {
    approvedAt: number;
    approvalTokenHash: string;
    expiresAt: number;
  };
}
