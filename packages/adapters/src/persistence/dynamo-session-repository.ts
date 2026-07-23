import type { ChallengeSession, SessionRepository } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

interface StoredSession extends ChallengeSession {
  PK: string;
  SK: 'META';
}

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

function toStored(session: ChallengeSession): StoredSession {
  return { PK: `SESSION#${session.id}`, SK: 'META', ...session };
}

function fromStored(value: Record<string, unknown>): ChallengeSession | null {
  if (
    typeof value.id !== 'string' ||
    typeof value.nonce !== 'string' ||
    typeof value.expiresAt !== 'number' ||
    typeof value.challengeId !== 'string' ||
    !['pending', 'paired', 'failed'].includes(String(value.verdict))
  ) {
    return null;
  }
  const session = { ...value };
  delete session.PK;
  delete session.SK;
  return session as unknown as ChallengeSession;
}

export function createDynamoSessionRepository(
  client: DynamoDBDocumentClient,
  tableName: string,
  nowEpochSeconds: () => number
): SessionRepository {
  return {
    async create(session): Promise<{ ok: true } | { ok: false; reason: 'collision' }> {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: toStored(session),
            ConditionExpression: 'attribute_not_exists(PK)',
          })
        );
        return { ok: true };
      } catch (error) {
        if (isConditionalFailure(error)) return { ok: false, reason: 'collision' };
        throw error;
      }
    },

    async load(sessionId): Promise<ChallengeSession | null> {
      const response = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `SESSION#${sessionId}`, SK: 'META' },
          ConsistentRead: true,
        })
      );
      const session = response.Item ? fromStored(response.Item) : null;
      return session && session.expiresAt >= nowEpochSeconds() ? session : null;
    },
  };
}
