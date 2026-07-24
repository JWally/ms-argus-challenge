import { describe, expect, it } from 'vitest';
import { merchantProjection } from '@argus-challenge/testkit';
import {
  classifyProjection,
  computeProjectionVerdict,
  isProjectionFresh,
  type ClassifiedProjection,
} from './projection-policy.js';

function scan(overrides: Partial<ClassifiedProjection> = {}): ClassifiedProjection {
  return {
    individualScore: 0,
    isPhone: false,
    isDatacenter: false,
    isProxy: false,
    patAttested: false,
    browserName: 'Chrome',
    browserVersion: '150',
    os: 'Windows',
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0',
    asnName: 'Example ASN',
    city: 'Dallas',
    country: 'US',
    isMobileNetwork: false,
    isVpn: false,
    isIsolatedLocationMismatch: false,
    ...overrides,
  };
}

describe('projection classification and verdict policy', () => {
  it('classifies phones from browser details and user agent', () => {
    const projection = merchantProjection({
      identification: {
        crypto_device_id: null,
        crypto_verified: null,
        browserDetails: {
          browserName: 'Chrome',
          browserVersion: '150',
          device: 'mobile',
          os: 'iOS',
          userAgent: 'Mozilla/5.0 (iPhone) Mobile',
        },
      },
    });
    expect(classifyProjection(projection)).toMatchObject({ isPhone: true });
  });

  it.each([
    [scan({ isProxy: true }), scan({ isPhone: true }), 'desktop_on_proxy'],
    [scan(), scan({ isPhone: true, isDatacenter: true }), 'phone_on_datacenter'],
    [scan(), scan(), 'both_sides_desktop'],
    [scan(), scan({ isPhone: true }), 'paired_desktop_and_phone'],
    [scan({ isPhone: true }), scan({ isPhone: true }), 'paired_phone_to_phone'],
  ])('preserves verdict reason %#', (desktop, phone, reason) => {
    expect(computeProjectionVerdict(desktop, phone).reason).toBe(reason);
  });

  it('allows only isolated score-35 travel location mismatch', () => {
    const isolated = classifyProjection(
      merchantProjection({
        automation: 0,
        device_tampering: 35,
        network_tampering: 0,
        tags: ['location_mismatch', 'apple_attestation_missing'],
      })
    );
    expect(isolated.isIsolatedLocationMismatch).toBe(true);
    expect(computeProjectionVerdict(isolated, scan({ isPhone: true })).verdict).toBe('paired');
    expect(
      computeProjectionVerdict(
        classifyProjection(
          merchantProjection({
            device_tampering: 35,
            tags: ['location_mismatch', 'unrecognized_signal'],
          })
        ),
        scan({ isPhone: true })
      ).reason
    ).toBe('desktop_score_high');
  });

  it('uses an injected clock for the three-minute freshness boundary', () => {
    const now = Date.UTC(2030, 0, 1);
    expect(isProjectionFresh(merchantProjection({ created_at: now - 180_000 }), now)).toBe(true);
    expect(isProjectionFresh(merchantProjection({ created_at: now - 181_000 }), now)).toBe(false);
    expect(isProjectionFresh(null, now)).toBe(false);
  });
});
