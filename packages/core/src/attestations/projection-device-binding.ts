import { createHash } from 'node:crypto';
import type { MerchantProjection } from '@argus-challenge/contracts';

const PROJECTION_DEVICE_ID_HEX_LENGTH = 10;

type ProjectionLeg = 'desktop' | 'phone';

interface ProjectionBindingInput {
  desktopProjection: MerchantProjection;
  phoneProjection: MerchantProjection;
  desktopPublicKey: string;
  phonePublicKey: string;
}

interface ProjectionBindingAnnotations extends Record<string, boolean> {
  desktop_projection_identity_present: boolean;
  desktop_projection_identity_verified: boolean;
  desktop_projection_device_bound: boolean;
  phone_projection_identity_present: boolean;
  phone_projection_identity_verified: boolean;
  phone_projection_device_bound: boolean;
}

interface ProjectionDeviceBinding {
  identityPresent: boolean;
  identityVerified: boolean;
  deviceBound: boolean;
}

type ProjectionBindingResult =
  | { ok: true; annotations: ProjectionBindingAnnotations }
  | { ok: false; reason: string; annotations: ProjectionBindingAnnotations };

interface LegBinding {
  present: boolean;
  verified: boolean;
  bound: boolean;
  failureReason: string | null;
}

export function projectionDeviceId(publicKey: string): string {
  return createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .slice(0, PROJECTION_DEVICE_ID_HEX_LENGTH);
}

export function evaluateProjectionDeviceBinding(
  projection: MerchantProjection,
  publicKey: string
): ProjectionDeviceBinding {
  const identity = projection.identification;
  const identityPresent = identity.crypto_device_id !== null;
  const identityVerified = identity.crypto_verified === true;
  const deviceBound =
    identityPresent &&
    identityVerified &&
    identity.crypto_device_id === projectionDeviceId(publicKey);

  return { identityPresent, identityVerified, deviceBound };
}

function evaluateLeg(
  leg: ProjectionLeg,
  projection: MerchantProjection,
  publicKey: string
): LegBinding {
  const binding = evaluateProjectionDeviceBinding(projection, publicKey);
  const present = binding.identityPresent;
  const verified = binding.identityVerified;
  const bound = binding.deviceBound;

  let failureReason: string | null = null;
  if (!present) failureReason = `${leg}_projection_identity_missing`;
  else if (!verified) failureReason = `${leg}_projection_identity_unverified`;
  else if (!bound) failureReason = `${leg}_projection_device_mismatch`;

  return { present, verified, bound, failureReason };
}

export function evaluatePairProjectionBindings(
  input: ProjectionBindingInput
): ProjectionBindingResult {
  const desktop = evaluateLeg('desktop', input.desktopProjection, input.desktopPublicKey);
  const phone = evaluateLeg('phone', input.phoneProjection, input.phonePublicKey);
  const annotations: ProjectionBindingAnnotations = {
    desktop_projection_identity_present: desktop.present,
    desktop_projection_identity_verified: desktop.verified,
    desktop_projection_device_bound: desktop.bound,
    phone_projection_identity_present: phone.present,
    phone_projection_identity_verified: phone.verified,
    phone_projection_device_bound: phone.bound,
  };
  const failureReason = desktop.failureReason ?? phone.failureReason;

  return failureReason
    ? { ok: false, reason: failureReason, annotations }
    : { ok: true, annotations };
}
