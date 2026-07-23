import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoSingleUseStore } from './dynamo-single-use-store.js';

describe('Dynamo single-use token store', () => {
  it('stores a token with TTL and atomically takes its old value', async () => {
    const ddb = {
      send: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Attributes: { value: 'sealed-value', expiresAt: 1_100 } }),
    };
    const store = createDynamoSingleUseStore(
      ddb as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_000
    );
    await store.put('ptoken:abc', 'sealed-value', 100);
    await expect(store.take('ptoken:abc')).resolves.toBe('sealed-value');
    expect(ddb.send.mock.calls[0]?.[0].input).toMatchObject({
      Item: {
        PK: 'TOKEN#ptoken:abc',
        SK: 'SINGLE_USE',
        value: 'sealed-value',
        expiresAt: 1_100,
      },
    });
    expect(ddb.send.mock.calls[1]?.[0].input).toMatchObject({
      Key: { PK: 'TOKEN#ptoken:abc', SK: 'SINGLE_USE' },
      ReturnValues: 'ALL_OLD',
    });
  });

  it('returns null for missing or TTL-lagged values after consuming them', async () => {
    const ddb = {
      send: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Attributes: { value: 'old', expiresAt: 999 } }),
    };
    const store = createDynamoSingleUseStore(
      ddb as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_000
    );
    await expect(store.take('missing')).resolves.toBeNull();
    await expect(store.take('expired')).resolves.toBeNull();
  });
});
