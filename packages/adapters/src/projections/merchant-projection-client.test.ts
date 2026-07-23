import { describe, expect, it, vi } from 'vitest';
import { merchantProjection } from '@argus-challenge/testkit';
import {
  createMerchantProjectionClient,
  splitMerchantCredential,
} from './merchant-projection-client.js';

const config = {
  apiUrl: 'https://merchant.example',
  credential: 'key-123.signed-token-body',
  cpi: 'argus_cpi_test_Example12345',
  warn: vi.fn(),
};

describe('merchant projection client', () => {
  it('splits only the first credential separator', () => {
    expect(splitMerchantCredential('key.token.with.dots')).toEqual({
      keyId: 'key',
      token: 'token.with.dots',
    });
    expect(() => splitMerchantCredential('malformed')).toThrow('credential malformed');
  });

  it('calls the current API contract with encoded identity and credential headers', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(merchantProjection({ session_id: 'scan/with space' })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = createMerchantProjectionClient({ ...config, fetch });
    await expect(client.fetchProjection('scan/with space')).resolves.toMatchObject({
      ok: true,
      projection: { session_id: 'scan/with space' },
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://merchant.example/v1/session/argus_cpi_test_Example12345/scan%2Fwith%20space',
      {
        method: 'GET',
        headers: { 'x-api-key': 'key-123', 'x-argus-token': 'signed-token-body' },
      }
    );
  });

  it.each([
    [401, 'unauthorized'],
    [402, 'insufficient_credits'],
    [404, 'not_found'],
    [409, 'conflict'],
    [503, 'upstream_error'],
  ])('maps HTTP %s to %s', async (status, reason) => {
    const fetch = vi.fn().mockResolvedValue(new Response('failure', { status }));
    const client = createMerchantProjectionClient({ ...config, fetch });
    await expect(client.fetchProjection('scan-1')).resolves.toEqual({
      ok: false,
      reason,
      status,
    });
  });

  it('rejects malformed successful JSON and projection contracts', async () => {
    const invalidJson = createMerchantProjectionClient({
      ...config,
      fetch: vi.fn().mockResolvedValue(new Response('{oops', { status: 200 })),
    });
    await expect(invalidJson.fetchProjection('scan-1')).resolves.toEqual({
      ok: false,
      reason: 'invalid_json',
    });

    const invalidProjection = createMerchantProjectionClient({
      ...config,
      fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    });
    await expect(invalidProjection.fetchProjection('scan-1')).resolves.toEqual({
      ok: false,
      reason: 'invalid_projection',
    });
  });
});
