import { describe, expect, it } from 'vitest';
import { merchantProjection } from '@argus-challenge/testkit';
import { MerchantProjectionSchema } from './merchant-projection.js';

describe('merchant projection contract', () => {
  it('accepts the API-owned current shape', () => {
    const projection = merchantProjection();
    const parsed = MerchantProjectionSchema.parse({
      ...projection,
      identification: {
        ...projection.identification,
        crypto_device_id: '02a05e53a4',
        crypto_verified: true,
      },
    });

    expect(parsed).toMatchObject({
      session_id: 'session-fixture',
      identification: {
        crypto_device_id: '02a05e53a4',
        crypto_verified: true,
      },
    });
  });

  it.each([
    ['wrong schema', { schema_version: 2 }],
    ['score out of range', { automation: 101 }],
    ['missing browser contract', { identification: {} }],
    ['invalid network result', { ipInfo: { vpn: { result: 'yes' } } }],
  ])('rejects %s', (_label, override) => {
    expect(
      MerchantProjectionSchema.safeParse({ ...merchantProjection(), ...override }).success
    ).toBe(false);
  });

  it('rejects a malformed cryptographic device id', () => {
    const projection = merchantProjection();

    expect(
      MerchantProjectionSchema.safeParse({
        ...projection,
        identification: {
          ...projection.identification,
          crypto_device_id: 'not-a-device-id',
          crypto_verified: true,
        },
      }).success
    ).toBe(false);
  });
});
