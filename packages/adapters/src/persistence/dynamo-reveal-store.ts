import type { VerdictRevealState } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

function key(sessionId: string) {
  return { PK: `REVEAL#${sessionId}`, SK: 'STATE' };
}

function normalize(item: Record<string, unknown> | undefined): VerdictRevealState | null {
  return item ? { challenge: item.challenge === true, phoneDone: item.phoneDone === true } : null;
}

export function createDynamoRevealStore(client: DynamoDBDocumentClient, tableName: string) {
  return {
    async markChallenge(
      sessionId: string,
      challenge: boolean,
      expiresAt: number
    ): Promise<VerdictRevealState> {
      const result = await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key(sessionId),
          UpdateExpression:
            'SET challenge = :challenge, phoneDone = if_not_exists(phoneDone, :notDone), expiresAt = :expiresAt',
          ExpressionAttributeValues: {
            ':challenge': challenge,
            ':notDone': false,
            ':expiresAt': expiresAt,
          },
          ReturnValues: 'ALL_NEW',
        })
      );
      return normalize(result.Attributes) ?? { challenge, phoneDone: false };
    },

    async markPhoneDone(sessionId: string, expiresAt: number): Promise<VerdictRevealState> {
      const result = await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key(sessionId),
          UpdateExpression:
            'SET phoneDone = :done, challenge = if_not_exists(challenge, :challenge), expiresAt = :expiresAt',
          ExpressionAttributeValues: {
            ':done': true,
            ':challenge': true,
            ':expiresAt': expiresAt,
          },
          ReturnValues: 'ALL_NEW',
        })
      );
      return normalize(result.Attributes) ?? { challenge: true, phoneDone: true };
    },

    async load(sessionId: string): Promise<VerdictRevealState | null> {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: key(sessionId),
          ConsistentRead: true,
        })
      );
      return normalize(result.Item);
    },
  };
}
