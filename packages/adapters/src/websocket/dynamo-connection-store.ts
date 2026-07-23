import type { BootstrapClaims } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

interface ConnectionStoreContext {
  client: DynamoDBDocumentClient;
  tableName: string;
  nowEpochSeconds(): number;
}

function isTransactionCollision(error: unknown): boolean {
  return (error as { name?: unknown }).name === 'TransactionCanceledException';
}

async function claim(
  context: ConnectionStoreContext,
  claims: BootstrapClaims,
  connectionId: string
): Promise<boolean> {
  const expiresAt = Math.min(claims.exp + 60, context.nowEpochSeconds() + 360);
  try {
    await context.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: context.tableName,
              Item: {
                PK: `WS#${claims.sessionId}`,
                SK: claims.role,
                connectionId,
                expiresAt,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: context.tableName,
              Item: {
                PK: `WSC#${connectionId}`,
                SK: 'META',
                sessionId: claims.sessionId,
                role: claims.role,
                expiresAt,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      })
    );
    return true;
  } catch (error) {
    if (isTransactionCollision(error)) return false;
    throw error;
  }
}

async function deleteConnectionRecords(
  context: ConnectionStoreContext,
  connectionId: string,
  sessionId: string,
  role: string
): Promise<void> {
  await Promise.allSettled([
    context.client.send(
      new DeleteCommand({
        TableName: context.tableName,
        Key: { PK: `WS#${sessionId}`, SK: role },
        ConditionExpression: 'connectionId = :connectionId',
        ExpressionAttributeValues: { ':connectionId': connectionId },
      })
    ),
    context.client.send(
      new DeleteCommand({
        TableName: context.tableName,
        Key: { PK: `WSC#${connectionId}`, SK: 'META' },
      })
    ),
  ]);
}

async function release(context: ConnectionStoreContext, connectionId: string): Promise<void> {
  const response = await context.client.send(
    new GetCommand({
      TableName: context.tableName,
      Key: { PK: `WSC#${connectionId}`, SK: 'META' },
      ConsistentRead: true,
    })
  );
  const item = response.Item as Record<string, unknown> | undefined;
  const sessionId = item?.sessionId;
  const role = item?.role;
  if (typeof sessionId !== 'string' || !['desktop', 'phone'].includes(String(role))) return;
  await deleteConnectionRecords(context, connectionId, sessionId, String(role));
}

export function createDynamoConnectionStore(
  client: DynamoDBDocumentClient,
  tableName: string,
  nowEpochSeconds: () => number
) {
  const context = { client, tableName, nowEpochSeconds };
  return {
    claim: (claims: BootstrapClaims, connectionId: string) => claim(context, claims, connectionId),
    release: (connectionId: string) => release(context, connectionId),
  };
}
