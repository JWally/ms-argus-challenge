import { describe, expect, it } from 'vitest';
import { evaluateSsoContinuity, type SsoLegProfile } from './continuity.js';

const profile: SsoLegProfile = {
  argusSessionId: 'scan-1',
  keyId: 'device-key',
  ip: '203.0.113.8',
  asnName: 'Mobile Carrier',
  country: 'US',
  city: 'Dallas',
  score: 5,
  isPhone: true,
  isProxy: false,
  isDatacenter: false,
  isVpn: false,
};

function legs(overrides: Partial<SsoLegProfile> = {}) {
  return {
    start: profile,
    challenge: { ...profile, argusSessionId: 'scan-2' },
    validate: { ...profile, argusSessionId: 'scan-3', ...overrides },
  };
}

describe('SSO continuity', () => {
  it('approves three phone legs with device, network, and risk continuity', () => {
    expect(evaluateSsoContinuity(legs())).toEqual({
      ok: true,
      reason: 'approved',
      reasons: ['phone_classified', 'device_key_match', 'network_continuity', 'risk_stable'],
    });
  });

  it.each([
    [{ isPhone: false }, 'not_phone'],
    [{ keyId: 'different-key' }, 'device_changed'],
    [{ isVpn: true }, 'network_changed'],
    [{ asnName: 'Other Carrier', ip: '198.51.100.2' }, 'network_changed'],
    [{ score: 41 }, 'risk_changed'],
  ] as const)('fails closed for %#', (overrides, reason) => {
    expect(evaluateSsoContinuity(legs(overrides))).toMatchObject({ ok: false, reason });
  });
});
