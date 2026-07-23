import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoAttestationRepository } from './dynamo-attestation-repository.js';

const SESSION_ID = '4f4cf495-a98b-4b76-9099-8ad59dc85ccb';

function repository(send: ReturnType<typeof vi.fn>) {
  return createDynamoAttestationRepository(
    { send } as unknown as DynamoDBDocumentClient,
    'challenge-table',
    () => 1_900_000_000
  );
}

describe('Dynamo attestation repository', () => {
  it('claims an Argus session for 24 hours', async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(
      repository(send).claimArgusSession('argus-1', SESSION_ID, 'desktop')
    ).resolves.toEqual({ ok: true });
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Item: {
        PK: 'ARGUS#argus-1',
        SK: 'CLAIM',
        pairSessionId: SESSION_ID,
        role: 'desktop',
        expiresAt: 1_900_086_400,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    });
  });

  it('allows an idempotent same-session claim and rejects cross-session replay', async () => {
    const collision = Object.assign(new Error('collision'), {
      name: 'ConditionalCheckFailedException',
    });
    const same = vi
      .fn()
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ Item: { pairSessionId: SESSION_ID, role: 'phone' } });
    await expect(
      repository(same).claimArgusSession('argus-1', SESSION_ID, 'phone')
    ).resolves.toEqual({
      ok: true,
    });

    const other = vi
      .fn()
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ Item: { pairSessionId: 'other', role: 'phone' } });
    await expect(
      repository(other).claimArgusSession('argus-1', SESSION_ID, 'phone')
    ).resolves.toEqual({
      ok: false,
      reason: 'already_claimed',
    });
  });

  it('claims the desktop slot with a conditional update', async () => {
    const send = vi.fn().mockResolvedValue({});
    const stored = { argusSessionId: 'argus-1' } as never;
    await expect(repository(send).storeDesktopAttestation(SESSION_ID, stored)).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Key: { PK: `SESSION#${SESSION_ID}`, SK: 'META' },
      UpdateExpression: 'SET desktopAttestation = :attestation',
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(desktopAttestation)',
    });
  });
});
