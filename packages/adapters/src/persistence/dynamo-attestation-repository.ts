import type {
  ArgusSessionClaim,
  ArgusSessionRole,
  StoredDesktopAttestation,
} from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ARGUS_CLAIM_TTL_SECONDS = 24 * 60 * 60;

interface AttestationStoreContext {
  client: DynamoDBDocumentClient;
  tableName: string;
  nowEpochSeconds(): number;
}

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

async function existingClaim(
  context: AttestationStoreContext,
  argusSessionId: string,
  pairSessionId: string,
  role: ArgusSessionRole
) {
  const existing = await context.client.send(
    new GetCommand({
      TableName: context.tableName,
      Key: { PK: `ARGUS#${argusSessionId}`, SK: 'CLAIM' },
      ConsistentRead: true,
    })
  );
  return existing.Item?.pairSessionId === pairSessionId && existing.Item?.role === role
    ? ({ ok: true } as const)
    : ({ ok: false, reason: 'already_claimed' } as const);
}

async function claimArgusSession(
  context: AttestationStoreContext,
  argusSessionId: string,
  pairSessionId: string,
  role: ArgusSessionRole
) {
  try {
    await context.client.send(
      new PutCommand({
        TableName: context.tableName,
        Item: {
          PK: `ARGUS#${argusSessionId}`,
          SK: 'CLAIM',
          pairSessionId,
          role,
          claimedAt: context.nowEpochSeconds(),
          expiresAt: context.nowEpochSeconds() + ARGUS_CLAIM_TTL_SECONDS,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );
    return { ok: true } as const;
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
    return existingClaim(context, argusSessionId, pairSessionId, role);
  }
}

async function storeDesktopAttestation(
  context: AttestationStoreContext,
  sessionId: string,
  attestation: StoredDesktopAttestation
): Promise<boolean> {
  try {
    await context.client.send(
      new UpdateCommand({
        TableName: context.tableName,
        Key: { PK: `SESSION#${sessionId}`, SK: 'META' },
        UpdateExpression: 'SET desktopAttestation = :attestation',
        ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(desktopAttestation)',
        ExpressionAttributeValues: { ':attestation': attestation },
      })
    );
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

export function createDynamoAttestationRepository(
  client: DynamoDBDocumentClient,
  tableName: string,
  nowEpochSeconds: () => number
): {
  claimArgusSession: ArgusSessionClaim;
  storeDesktopAttestation(
    sessionId: string,
    attestation: StoredDesktopAttestation
  ): Promise<boolean>;
} {
  const context = { client, tableName, nowEpochSeconds };
  return {
    claimArgusSession: (argusSessionId, pairSessionId, role) =>
      claimArgusSession(context, argusSessionId, pairSessionId, role),
    storeDesktopAttestation: (sessionId, attestation) =>
      storeDesktopAttestation(context, sessionId, attestation),
  };
}
