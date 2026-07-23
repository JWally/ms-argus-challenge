import type { SingleUseTokenStore } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

export function createDynamoSingleUseStore(
  client: DynamoDBDocumentClient,
  tableName: string,
  nowEpochSeconds: () => number
): SingleUseTokenStore {
  return {
    async put(key, value, ttlSeconds): Promise<void> {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: `TOKEN#${key}`,
            SK: 'SINGLE_USE',
            value,
            expiresAt: nowEpochSeconds() + ttlSeconds,
          },
        })
      );
    },

    async take(key): Promise<string | null> {
      const response = await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: `TOKEN#${key}`, SK: 'SINGLE_USE' },
          ReturnValues: 'ALL_OLD',
        })
      );
      const attributes = response.Attributes as Record<string, unknown> | undefined;
      const value = attributes?.value;
      const expiresAt = attributes?.expiresAt;
      return typeof value === 'string' &&
        typeof expiresAt === 'number' &&
        expiresAt >= nowEpochSeconds()
        ? value
        : null;
    },
  };
}
