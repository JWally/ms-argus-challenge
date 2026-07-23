import { describe, expect, it } from 'vitest';
import { merchantProjection } from '@argus-challenge/testkit';
import { MerchantProjectionSchema } from './merchant-projection.js';

describe('merchant projection contract', () => {
  it('accepts the API-owned current shape', () => {
    expect(MerchantProjectionSchema.parse(merchantProjection()).session_id).toBe('session-fixture');
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
});
