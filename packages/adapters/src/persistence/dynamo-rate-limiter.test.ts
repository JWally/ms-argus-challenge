import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoFixedWindowRateLimiter } from './dynamo-rate-limiter.js';

describe('Dynamo session-start rate limiter', () => {
  it('allows exactly the configured count in one hashed fixed window', async () => {
    const send = vi.fn().mockResolvedValue({});
    const limiter = createDynamoFixedWindowRateLimiter({
      client: { send } as unknown as DynamoDBDocumentClient,
      tableName: 'challenge-table',
      nowEpochSeconds: () => 1_000,
      max: 20,
      windowSeconds: 60,
    });
    await expect(limiter.allow('203.0.113.8')).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      UpdateExpression: 'ADD requestCount :one SET expiresAt = if_not_exists(expiresAt, :ttl)',
      ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :max',
      ExpressionAttributeValues: { ':one': 1, ':max': 20, ':ttl': 1_120 },
    });
    expect(send.mock.calls[0]?.[0].input.Key.PK).toMatch(/^RATE#session-start#[a-f0-9]{32}#16$/);
  });

  it('maps only a conditional cap to denied', async () => {
    const capped = Object.assign(new Error('capped'), {
      name: 'ConditionalCheckFailedException',
    });
    const limiter = createDynamoFixedWindowRateLimiter({
      client: { send: vi.fn().mockRejectedValue(capped) } as unknown as DynamoDBDocumentClient,
      tableName: 'challenge-table',
      nowEpochSeconds: () => 1_000,
      max: 20,
      windowSeconds: 60,
    });
    await expect(limiter.allow('203.0.113.8')).resolves.toBe(false);
  });
});
