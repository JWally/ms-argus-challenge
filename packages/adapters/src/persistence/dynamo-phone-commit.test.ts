import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoPhoneCommitter } from './dynamo-phone-commit.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const input = {
  sessionId: SESSION_ID,
  stored: { publicKey: 'phone-key' },
  verdict: 'paired' as const,
  reason: 'paired_desktop_and_phone',
  annotations: { total_score: 0 },
};

describe('Dynamo phone decision commit', () => {
  it('conditionally writes the one phone slot and decision', async () => {
    const send = vi.fn().mockResolvedValue({});
    const commit = createDynamoPhoneCommitter(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table'
    );
    await expect(commit(input as never)).resolves.toEqual({ outcome: 'committed' });
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Key: { PK: `SESSION#${SESSION_ID}`, SK: 'META' },
      ConditionExpression:
        'attribute_exists(PK) AND attribute_exists(desktopAttestation) AND attribute_not_exists(phoneAttestation)',
      ExpressionAttributeValues: {
        ':phone': input.stored,
        ':verdict': 'paired',
        ':reason': 'paired_desktop_and_phone',
        ':annotations': { total_score: 0 },
      },
    });
  });

  it.each([
    [{ phoneAttestation: { publicKey: 'phone-key' }, verdict: 'paired' }, 'same_device_retry'],
    [{ phoneAttestation: { publicKey: 'other-key' }, verdict: 'paired' }, 'other_device'],
    [{ verdict: 'pending' }, 'write_conflict'],
  ] as const)('normalizes a conditional race %#', async (existing, outcome) => {
    const collision = Object.assign(new Error('collision'), {
      name: 'ConditionalCheckFailedException',
    });
    const send = vi.fn().mockRejectedValueOnce(collision).mockResolvedValueOnce({ Item: existing });
    const commit = createDynamoPhoneCommitter(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table'
    );
    await expect(commit(input as never)).resolves.toEqual({ outcome });
  });
});
