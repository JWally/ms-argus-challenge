import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoConnectionStore } from './dynamo-connection-store.js';

const claims = {
  v: 1 as const,
  sessionId: '11111111-1111-4111-8111-111111111111',
  role: 'desktop' as const,
  iat: 1_900_000_000,
  exp: 1_900_000_300,
};

describe('Dynamo WebSocket connection ownership', () => {
  it('atomically claims forward and reverse rows for one live role', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoConnectionStore(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(store.claim(claims, 'connection-1')).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0].input.TransactItems).toHaveLength(2);
    expect(send.mock.calls[0]?.[0].input.TransactItems[0].Put.Item).toMatchObject({
      PK: `WS#${claims.sessionId}`,
      SK: 'desktop',
      connectionId: 'connection-1',
    });
  });

  it('maps a transaction collision to denied and releases only its own rows', async () => {
    const collision = Object.assign(new Error('collision'), {
      name: 'TransactionCanceledException',
    });
    const denied = createDynamoConnectionStore(
      { send: vi.fn().mockRejectedValue(collision) } as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(denied.claim(claims, 'connection-1')).resolves.toBe(false);

    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: { sessionId: claims.sessionId, role: 'desktop' } })
      .mockResolvedValue({});
    const store = createDynamoConnectionStore(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await store.release('connection-1');
    expect(send.mock.calls[1]?.[0].input).toMatchObject({
      Key: { PK: `WS#${claims.sessionId}`, SK: 'desktop' },
      ConditionExpression: 'connectionId = :connectionId',
    });
  });
});
