import type { PasskeyStore, StoredPasskey } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

function readPasskey(value: Record<string, unknown> | undefined): StoredPasskey | null {
  if (
    !value ||
    typeof value.credentialId !== 'string' ||
    typeof value.publicKey !== 'string' ||
    typeof value.signCount !== 'number' ||
    (typeof value.argusPublicKey !== 'string' && value.argusPublicKey !== null) ||
    typeof value.createdAt !== 'number' ||
    typeof value.lastUsedAt !== 'number'
  ) {
    return null;
  }
  return {
    credentialId: value.credentialId,
    publicKey: value.publicKey,
    signCount: value.signCount,
    argusPublicKey: value.argusPublicKey,
    createdAt: value.createdAt,
    lastUsedAt: value.lastUsedAt,
  };
}

export function createDynamoPasskeyStore(
  client: DynamoDBDocumentClient,
  tableName: string
): PasskeyStore {
  return {
    async load(credentialId): Promise<StoredPasskey | null> {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `PASSKEY#${credentialId}`, SK: 'CREDENTIAL' },
          ConsistentRead: true,
        })
      );
      return readPasskey(result.Item);
    },

    async save(record): Promise<void> {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: `PASSKEY#${record.credentialId}`,
            SK: 'CREDENTIAL',
            ...record,
          },
        })
      );
    },
  };
}
