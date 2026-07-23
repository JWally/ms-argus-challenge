import { describe, expect, it } from 'vitest';
import { createDeviceTrustTokens } from './device-trust.js';

const NOW = 1_900_000_000;

describe('device trust tokens', () => {
  it('binds public key and records IP drift as telemetry', () => {
    const tokens = createDeviceTrustTokens('device-secret', () => NOW);
    const token = tokens.mint('phone-public-key', 'phone-key-id', '203.0.113.8');
    expect(token).not.toBeNull();
    expect(tokens.verify(token!, '198.51.100.9', 'phone-public-key')).toMatchObject({
      ok: true,
      ipChanged: true,
      payload: { pubkey: 'phone-public-key', keyId: 'phone-key-id', exp: NOW + 43_200 },
    });
  });

  it('rejects modified, expired, and cross-key tokens', () => {
    const tokens = createDeviceTrustTokens('device-secret', () => NOW);
    const token = tokens.mint('phone-public-key', 'phone-key-id', '203.0.113.8')!;
    expect(tokens.verify(`${token}x`, '203.0.113.8', 'phone-public-key').ok).toBe(false);
    expect(
      createDeviceTrustTokens('device-secret', () => NOW + 43_201).verify(
        token,
        '203.0.113.8',
        'phone-public-key'
      )
    ).toMatchObject({ ok: false, reason: 'expired' });
    expect(tokens.verify(token, '203.0.113.8', 'other-key')).toMatchObject({
      ok: false,
      reason: 'pubkey_mismatch',
    });
  });

  it('does not mint without secret or source IP', () => {
    expect(createDeviceTrustTokens(null, () => NOW).mint('key', 'id', '203.0.113.8')).toBeNull();
    expect(createDeviceTrustTokens('secret', () => NOW).mint('key', 'id', '')).toBeNull();
  });
});
