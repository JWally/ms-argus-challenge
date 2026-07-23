import type { StoredPairAttestation } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

interface PhoneCommitInput {
  sessionId: string;
  stored: StoredPairAttestation;
  verdict: 'paired' | 'failed';
  reason: string;
  annotations: Record<string, unknown>;
}

type PhoneCommitOutcome =
  | { outcome: 'committed' }
  | { outcome: 'same_device_retry' }
  | { outcome: 'other_device' }
  | { outcome: 'write_conflict' };

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

function raceOutcome(
  existing: Record<string, unknown> | undefined,
  submittedPublicKey: string
): PhoneCommitOutcome {
  const phone = existing?.phoneAttestation as { publicKey?: unknown } | undefined;
  const existingPublicKey = typeof phone?.publicKey === 'string' ? phone.publicKey : undefined;
  if (existingPublicKey && existingPublicKey !== submittedPublicKey) {
    return { outcome: 'other_device' };
  }
  if (
    existingPublicKey === submittedPublicKey &&
    ['paired', 'failed'].includes(String(existing?.verdict))
  ) {
    return { outcome: 'same_device_retry' };
  }
  return { outcome: 'write_conflict' };
}

export function createDynamoPhoneCommitter(client: DynamoDBDocumentClient, tableName: string) {
  return async (input: PhoneCommitInput): Promise<PhoneCommitOutcome> => {
    try {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: `SESSION#${input.sessionId}`, SK: 'META' },
          UpdateExpression:
            'SET phoneAttestation = :phone, verdict = :verdict, verdictReason = :reason, annotations = :annotations',
          ConditionExpression:
            'attribute_exists(PK) AND attribute_exists(desktopAttestation) AND attribute_not_exists(phoneAttestation)',
          ExpressionAttributeValues: {
            ':phone': input.stored,
            ':verdict': input.verdict,
            ':reason': input.reason,
            ':annotations': input.annotations,
          },
        })
      );
      return { outcome: 'committed' };
    } catch (error) {
      if (!isConditionalFailure(error)) throw error;
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `SESSION#${input.sessionId}`, SK: 'META' },
          ConsistentRead: true,
        })
      );
      return raceOutcome(result.Item, input.stored.publicKey);
    }
  };
}
