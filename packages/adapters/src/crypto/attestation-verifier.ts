import { createHash, createPublicKey, createVerify } from 'node:crypto';
import type {
  AttestationInput,
  AttestationVerifier,
  DecodedAttestationEnvelope,
} from '@argus-challenge/core';

const CLOCK_SKEW_SECONDS = 30;
const EXPECTED_PURPOSE = 'argus-pair-v1';

function trimInteger(component: Buffer): Buffer {
  let start = 0;
  while (start < component.length - 1 && component.readUInt8(start) === 0) start += 1;
  const trimmed = component.subarray(start);
  return (trimmed.readUInt8(0) & 0x80) === 0 ? trimmed : Buffer.concat([Buffer.from([0]), trimmed]);
}

export function p1363ToDer(signature: Buffer): Buffer {
  if (signature.length !== 64) {
    throw new Error('signature: expected 64 bytes for P-256');
  }
  const r = trimInteger(signature.subarray(0, 32));
  const s = trimInteger(signature.subarray(32));
  const sequence = Buffer.concat([
    Buffer.from([0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
  ]);
  return Buffer.concat([Buffer.from([0x30, sequence.length]), sequence]);
}

function decodeEnvelope(value: string): DecodedAttestationEnvelope | null {
  try {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    ) as DecodedAttestationEnvelope;
  } catch {
    return null;
  }
}

function verifyEnvelopePolicy(decoded: DecodedAttestationEnvelope, now: number): string | null {
  if (decoded.v !== 1) return 'envelope_version';
  if (decoded.purpose !== EXPECTED_PURPOSE) return 'envelope_purpose_mismatch';
  if (now < decoded.iat - CLOCK_SKEW_SECONDS) return 'envelope_not_yet_valid';
  if (now > decoded.exp + CLOCK_SKEW_SECONDS) return 'envelope_expired';
  return null;
}

function verifyKeyId(
  attestation: AttestationInput,
  decoded: DecodedAttestationEnvelope,
  publicKey: Buffer
): boolean {
  const derived = createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
  return derived === decoded.keyId && derived === attestation.keyId;
}

function verifySignature(
  attestation: AttestationInput,
  publicKeyBytes: Buffer
): { ok: true } | { ok: false; reason: string } {
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
  } catch {
    return { ok: false, reason: 'publicKey_not_spki' };
  }
  let signature: Buffer;
  try {
    signature = p1363ToDer(Buffer.from(attestation.signature, 'base64'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `signature_shape: ${message}` };
  }
  const verifier = createVerify('SHA256');
  verifier.update(attestation.envelope, 'utf8');
  return verifier.verify(publicKey, signature)
    ? { ok: true }
    : { ok: false, reason: 'signature_verify_failed' };
}

export function createAttestationVerifier(nowEpochSeconds: () => number): AttestationVerifier {
  return {
    verify(attestation) {
      const decoded = decodeEnvelope(attestation.envelope);
      if (!decoded) return { ok: false, reason: 'envelope_not_json' };
      const policyError = verifyEnvelopePolicy(decoded, nowEpochSeconds());
      if (policyError) return { ok: false, reason: policyError };
      const publicKeyBytes = Buffer.from(attestation.publicKey, 'base64');
      if (!verifyKeyId(attestation, decoded, publicKeyBytes)) {
        return { ok: false, reason: 'keyId_mismatch' };
      }
      const signature = verifySignature(attestation, publicKeyBytes);
      return signature.ok ? { ok: true, decoded } : signature;
    },
  };
}
