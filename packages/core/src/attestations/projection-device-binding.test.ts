import { describe, expect, it } from 'vitest';
import type { MerchantProjection } from '@argus-challenge/contracts';
import { merchantProjection } from '@argus-challenge/testkit';
import { evaluatePairProjectionBindings, projectionDeviceId } from './projection-device-binding.js';

const DESKTOP_PUBLIC_KEY = 'desktop-public-key';
const PHONE_PUBLIC_KEY = 'phone-public-key';

function identifiedProjection(
  cryptoDeviceId: string | null,
  cryptoVerified: boolean | null = true
): MerchantProjection {
  const projection = merchantProjection();
  return {
    ...projection,
    identification: {
      ...projection.identification,
      crypto_device_id: cryptoDeviceId,
      crypto_verified: cryptoVerified,
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    desktopProjection: identifiedProjection('02a05e53a4'),
    phoneProjection: identifiedProjection('ce382673da'),
    desktopPublicKey: DESKTOP_PUBLIC_KEY,
    phonePublicKey: PHONE_PUBLIC_KEY,
    ...overrides,
  };
}

describe('attestation projection device binding', () => {
  it('derives the API projection identifier from the attestation public-key string', () => {
    expect(projectionDeviceId(DESKTOP_PUBLIC_KEY)).toBe('02a05e53a4');
    expect(projectionDeviceId(PHONE_PUBLIC_KEY)).toBe('ce382673da');
  });

  it('accepts two verified projections bound to their attestation keys', () => {
    expect(evaluatePairProjectionBindings(input())).toEqual({
      ok: true,
      annotations: {
        desktop_projection_identity_present: true,
        desktop_projection_identity_verified: true,
        desktop_projection_device_bound: true,
        phone_projection_identity_present: true,
        phone_projection_identity_verified: true,
        phone_projection_device_bound: true,
      },
    });
  });

  it.each([
    [
      'desktop missing identity',
      { desktopProjection: identifiedProjection(null, null) },
      'desktop_projection_identity_missing',
    ],
    [
      'desktop unverified identity',
      { desktopProjection: identifiedProjection('02a05e53a4', false) },
      'desktop_projection_identity_unverified',
    ],
    [
      'desktop key mismatch',
      { desktopPublicKey: 'different-public-key' },
      'desktop_projection_device_mismatch',
    ],
    [
      'phone missing identity',
      { phoneProjection: identifiedProjection(null, null) },
      'phone_projection_identity_missing',
    ],
    [
      'phone unverified identity',
      { phoneProjection: identifiedProjection('ce382673da', false) },
      'phone_projection_identity_unverified',
    ],
    [
      'phone key mismatch',
      { phonePublicKey: 'different-public-key' },
      'phone_projection_device_mismatch',
    ],
  ])('fails closed for %s', (_label, override, reason) => {
    expect(evaluatePairProjectionBindings(input(override))).toMatchObject({
      ok: false,
      reason,
    });
  });
});
