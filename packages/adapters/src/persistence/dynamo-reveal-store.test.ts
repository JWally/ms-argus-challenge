import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoRevealStore } from './dynamo-reveal-store.js';

describe('Dynamo reveal state', () => {
  it('marks challenge and phone completion with a shared TTL row', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Attributes: { challenge: true, phoneDone: false } })
      .mockResolvedValueOnce({ Attributes: { challenge: true, phoneDone: true } });
    const store = createDynamoRevealStore(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table'
    );
    await expect(store.markChallenge('session-1', true, 2_000)).resolves.toEqual({
      challenge: true,
      phoneDone: false,
    });
    await expect(store.markPhoneDone('session-1', 2_000)).resolves.toEqual({
      challenge: true,
      phoneDone: true,
    });
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Key: { PK: 'REVEAL#session-1', SK: 'STATE' },
      ExpressionAttributeValues: { ':expiresAt': 2_000 },
    });
  });

  it('loads normalized state consistently', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { challenge: 1, phoneDone: true } });
    const store = createDynamoRevealStore(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table'
    );
    await expect(store.load('session-1')).resolves.toEqual({
      challenge: false,
      phoneDone: true,
    });
  });
});
