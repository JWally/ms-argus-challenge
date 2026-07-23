import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  createApiGatewayPublisher,
  createCachedSecretProvider,
  createDynamoConnectionStore,
  createDynamoRevealStore,
  createWebSocketCrypto,
} from '@argus-challenge/adapters';
import { createWebSocketRouter, type WebSocketEvent } from '@argus-challenge/core';

const nowEpochSeconds = () => Math.floor(Date.now() / 1000);

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

async function buildWebSocketApplication() {
  const tableName = environment('TABLE_NAME');
  const allowedOrigins = new Set(
    environment('ALLOWED_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
  const secret = await createCachedSecretProvider(
    new SecretsManagerClient({}),
    environment('WS_SECRET_ARN')
  ).get();
  if (!secret) throw new Error('WebSocket secret unavailable');
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const connections = createDynamoConnectionStore(client, tableName, nowEpochSeconds);
  const reveal = createDynamoRevealStore(client, tableName);
  const crypto = createWebSocketCrypto(Buffer.from(secret, 'utf8'), nowEpochSeconds);
  const publisher = createApiGatewayPublisher();
  return createWebSocketRouter({
    allowedOrigins,
    verifyBootstrapToken: crypto.verifyBootstrapToken,
    claimRoleConnection: connections.claim,
    releaseRoleConnection: connections.release,
    sealEnvelope: crypto.sealEnvelope,
    openEnvelope: crypto.openEnvelope,
    markPhoneChallenge: async (sessionId, challenge, expiresAt) => {
      await reveal.markChallenge(sessionId, challenge, expiresAt);
    },
    markPhoneDone: async (sessionId, expiresAt) => {
      await reveal.markPhoneDone(sessionId, expiresAt);
    },
    getVerdictRevealKey: crypto.getVerdictRevealKey,
    sendToConnection: publisher.fromEvent,
    nowEpochSeconds,
    logInfo: console.info,
  });
}

let application: Promise<Awaited<ReturnType<typeof buildWebSocketApplication>>> | null = null;

export async function handler(event: WebSocketEvent) {
  try {
    application ??= buildWebSocketApplication();
    return await (
      await application
    )(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[challenge-ws] unhandled error: ${message}`);
    return { statusCode: 500, body: 'internal_error' };
  }
}
