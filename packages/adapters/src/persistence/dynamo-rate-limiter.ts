import { createHash } from 'node:crypto';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

interface FixedWindowConfig {
  client: DynamoDBDocumentClient;
  tableName: string;
  nowEpochSeconds(): number;
  max: number;
  windowSeconds: number;
}

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

function ipBucket(ip: string): string {
  return createHash('sha256')
    .update(`session-start:${ip || 'unknown'}`)
    .digest('hex')
    .slice(0, 32);
}

export function createDynamoFixedWindowRateLimiter(config: FixedWindowConfig) {
  return {
    async allow(viewerIp: string): Promise<boolean> {
      const now = config.nowEpochSeconds();
      const window = Math.floor(now / config.windowSeconds);
      try {
        await config.client.send(
          new UpdateCommand({
            TableName: config.tableName,
            Key: {
              PK: `RATE#session-start#${ipBucket(viewerIp)}#${window}`,
              SK: 'COUNT',
            },
            UpdateExpression:
              'ADD requestCount :one SET expiresAt = if_not_exists(expiresAt, :ttl)',
            ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :max',
            ExpressionAttributeValues: {
              ':one': 1,
              ':max': config.max,
              ':ttl': now + config.windowSeconds * 2,
            },
          })
        );
        return true;
      } catch (error) {
        if (isConditionalFailure(error)) return false;
        throw error;
      }
    },
  };
}
