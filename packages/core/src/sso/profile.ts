import type { MerchantProjection } from '@argus-challenge/contracts';
import type { AttestationInput } from '../attestations/attestation-bindings.js';
import { evaluateProjectionDeviceBinding } from '../attestations/projection-device-binding.js';
import { classifyProjection } from '../verdicts/projection-policy.js';
import type { SsoLegProfile } from './continuity.js';

export type SsoScanLeg = 'start' | 'challenge' | 'validate';

export function profileFromProjection(
  argusSessionId: string,
  attestation: AttestationInput,
  projection: MerchantProjection | null
): SsoLegProfile {
  if (!projection) {
    return {
      argusSessionId,
      keyId: attestation.keyId,
      ip: null,
      asnName: null,
      country: null,
      city: null,
      score: null,
      isPhone: false,
      isProxy: false,
      isDatacenter: false,
      isVpn: false,
      projectionDeviceBound: false,
    };
  }
  const scan = classifyProjection(projection);
  const binding = evaluateProjectionDeviceBinding(projection, attestation.publicKey);
  return {
    argusSessionId,
    keyId: attestation.keyId,
    ip: scan.ip,
    asnName: scan.asnName,
    country: scan.country,
    city: scan.city,
    score: scan.individualScore,
    isPhone: scan.isPhone,
    isProxy: scan.isProxy,
    isDatacenter: scan.isDatacenter,
    isVpn: scan.isVpn,
    projectionDeviceBound: binding.deviceBound,
  };
}

export function requirePhoneProfile(
  profile: SsoLegProfile,
  leg: SsoScanLeg,
  failureReturnUrl: string
): { ok: true } | { ok: false; status: 403; body: Record<string, unknown> } {
  if (!profile.isPhone) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'sso_requires_phone',
        leg,
        message: 'SSO is only available from phone-classified Argus scans.',
        failureReturnUrl,
      },
    };
  }
  if (!profile.projectionDeviceBound) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'sso_projection_device_unbound',
        leg,
        message: 'The Argus scan does not match the device completing this SSO leg.',
        failureReturnUrl,
      },
    };
  }
  return { ok: true };
}
