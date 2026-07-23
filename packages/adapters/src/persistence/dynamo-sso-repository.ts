import {
  hashApprovalToken,
  type SsoSession,
  type StoredSsoChallenge,
  type StoredSsoValidation,
} from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

interface SsoStoreContext {
  client: DynamoDBDocumentClient;
  tableName: string;
  nowEpochSeconds(): number;
}

interface ConsumeApprovalInput {
  sessionId: string;
  cpi: string;
  token: string;
  challengeId?: string;
}

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

function readSession(item: Record<string, unknown> | undefined): SsoSession | null {
  if (
    !item ||
    typeof item.id !== 'string' ||
    typeof item.nonce !== 'string' ||
    typeof item.cpi !== 'string' ||
    typeof item.expiresAt !== 'number' ||
    !['pending', 'approved', 'failed'].includes(String(item.verdict))
  ) {
    return null;
  }
  const session = { ...item };
  delete session.PK;
  delete session.SK;
  return session as unknown as SsoSession;
}

async function conditionalUpdate(
  context: SsoStoreContext,
  command: UpdateCommand
): Promise<boolean> {
  try {
    await context.client.send(command);
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

async function createSession(context: SsoStoreContext, session: SsoSession): Promise<boolean> {
  try {
    await context.client.send(
      new PutCommand({
        TableName: context.tableName,
        Item: { PK: `SSO#${session.id}`, SK: 'META', ...session },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

async function loadSession(
  context: SsoStoreContext,
  sessionId: string
): Promise<SsoSession | null> {
  const response = await context.client.send(
    new GetCommand({
      TableName: context.tableName,
      Key: { PK: `SSO#${sessionId}`, SK: 'META' },
      ConsistentRead: true,
    })
  );
  const session = readSession(response.Item);
  return session && session.expiresAt >= context.nowEpochSeconds() ? session : null;
}

function recordChallenge(context: SsoStoreContext, input: StoredSsoChallenge) {
  return conditionalUpdate(
    context,
    new UpdateCommand({
      TableName: context.tableName,
      Key: { PK: `SSO#${input.sessionId}`, SK: 'META' },
      UpdateExpression:
        'SET challengeProfile = :profile, returnCodeHash = :hash, returnCodeExpiresAt = :expiresAt',
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(challengeProfile)',
      ExpressionAttributeValues: {
        ':profile': input.challengeProfile,
        ':hash': input.returnCodeHash,
        ':expiresAt': input.returnCodeExpiresAt,
      },
    })
  );
}

function validationValues(input: StoredSsoValidation): Record<string, unknown> {
  return {
    ':profile': input.validateProfile,
    ':verdict': input.verdict,
    ':reason': input.verdictReason,
    ':consumedAt': input.returnCodeConsumedAt,
    ':proof': input.proofAnnotations,
    ...(input.approval
      ? {
          ':approvedAt': input.approval.approvedAt,
          ':approvalHash': input.approval.approvalTokenHash,
          ':approvalExpiry': input.approval.expiresAt,
        }
      : {}),
  };
}

function recordValidation(context: SsoStoreContext, input: StoredSsoValidation) {
  const approvalSet = input.approval
    ? ', approvedAt = :approvedAt, approvalTokenHash = :approvalHash, expiresAt = :approvalExpiry'
    : '';
  return conditionalUpdate(
    context,
    new UpdateCommand({
      TableName: context.tableName,
      Key: { PK: `SSO#${input.sessionId}`, SK: 'META' },
      UpdateExpression:
        'SET validateProfile = :profile, verdict = :verdict, verdictReason = :reason, returnCodeConsumedAt = :consumedAt, proofAnnotations = :proof' +
        approvalSet,
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(returnCodeConsumedAt)',
      ExpressionAttributeValues: validationValues(input),
    })
  );
}

function consumeApproval(context: SsoStoreContext, input: ConsumeApprovalInput) {
  const challengeCondition = input.challengeId ? ' AND merchantChallengeId = :challengeId' : '';
  return conditionalUpdate(
    context,
    new UpdateCommand({
      TableName: context.tableName,
      Key: { PK: `SSO#${input.sessionId}`, SK: 'META' },
      UpdateExpression: 'SET approvalRedeemedAt = :now REMOVE approvalTokenHash',
      ConditionExpression:
        'attribute_exists(PK) AND verdict = :approved AND cpi = :cpi' +
        challengeCondition +
        ' AND approvalTokenHash = :hash AND attribute_not_exists(approvalRedeemedAt)',
      ExpressionAttributeValues: {
        ':now': context.nowEpochSeconds(),
        ':approved': 'approved',
        ':cpi': input.cpi,
        ':hash': hashApprovalToken(input.token),
        ...(input.challengeId ? { ':challengeId': input.challengeId } : {}),
      },
    })
  );
}

export function createDynamoSsoRepository(
  client: DynamoDBDocumentClient,
  tableName: string,
  nowEpochSeconds: () => number
) {
  const context = { client, tableName, nowEpochSeconds };
  return {
    createSession: (session: SsoSession) => createSession(context, session),
    loadSession: (sessionId: string) => loadSession(context, sessionId),
    recordChallenge: (input: StoredSsoChallenge) => recordChallenge(context, input),
    recordValidation: (input: StoredSsoValidation) => recordValidation(context, input),
    consumeApproval: (input: ConsumeApprovalInput) => consumeApproval(context, input),
  };
}
