import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoSessionRepository } from './dynamo-session-repository.js';

const session = {
  id: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
  nonce: 'nonce-123',
  expiresAt: 1_900_000_300,
  challengeId: 'checkout_action_123456789',
  cpi: 'argus_cpi_test_Example12345.forceauth',
  proofRequired: true,
  freshProofRequired: true,
  hostPreflightRequired: false,
  verdict: 'pending' as const,
};

function client(result: unknown = {}) {
  return { send: vi.fn().mockResolvedValue(result) };
}

describe('Dynamo session repository', () => {
  it('conditionally creates one session metadata row', async () => {
    const ddb = client();
    const repository = createDynamoSessionRepository(
      ddb as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(repository.create(session)).resolves.toEqual({ ok: true });
    expect(ddb.send.mock.calls[0]?.[0].input).toMatchObject({
      TableName: 'challenge-table',
      Item: { PK: `SESSION#${session.id}`, SK: 'META', ...session },
      ConditionExpression: 'attribute_not_exists(PK)',
    });
  });

  it('maps only a conditional collision to a domain result', async () => {
    const collision = Object.assign(new Error('collision'), {
      name: 'ConditionalCheckFailedException',
    });
    const ddb = { send: vi.fn().mockRejectedValue(collision) };
    const repository = createDynamoSessionRepository(
      ddb as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(repository.create(session)).resolves.toEqual({
      ok: false,
      reason: 'collision',
    });
  });

  it('loads a live session and hides its storage keys', async () => {
    const ddb = client({ Item: { PK: `SESSION#${session.id}`, SK: 'META', ...session } });
    const repository = createDynamoSessionRepository(
      ddb as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(repository.load(session.id)).resolves.toEqual(session);
  });

  it('treats missing and TTL-lagged rows as expired', async () => {
    const missing = createDynamoSessionRepository(
      client() as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(missing.load(session.id)).resolves.toBeNull();

    const expired = createDynamoSessionRepository(
      client({
        Item: { PK: 'x', SK: 'META', ...session, expiresAt: 1_899_999_999 },
      }) as unknown as DynamoDBDocumentClient,
      'challenge-table',
      () => 1_900_000_000
    );
    await expect(expired.load(session.id)).resolves.toBeNull();
  });
});
