import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  createApiGatewayPublisher,
  createAttestationVerifier,
  createCachedSecretProvider,
  createDeviceTrustTokens,
  createDynamoAttestationRepository,
  createDynamoFixedWindowRateLimiter,
  createDynamoPasskeyStore,
  createDynamoPhoneCommitter,
  createDynamoRevealStore,
  createDynamoSessionRepository,
  createDynamoSingleUseStore,
  createDynamoSsoRepository,
  createGoogleOidcVerifier,
  createMerchantProjectionClient,
  createVerdictDisclosure,
  createWebSocketCrypto,
} from '@argus-challenge/adapters';
import type { MerchantProjection } from '@argus-challenge/contracts';
import type { RuntimeConfig } from './runtime-config.js';

const nowEpochSeconds = () => Math.floor(Date.now() / 1000);

function documentClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function secretRoots(config: RuntimeConfig) {
  const client = new SecretsManagerClient({});
  const webSocket = createCachedSecretProvider(client, config.webSocketSecretArn);
  const deviceTrust = createCachedSecretProvider(client, config.deviceTrustSecretArn);
  const verdict = createCachedSecretProvider(client, config.verdictSecretArn);
  const [webSocketRoot, trustRoot] = await Promise.all([webSocket.get(), deviceTrust.get()]);
  if (!webSocketRoot || !trustRoot) throw new Error('required secrets unavailable');
  return { webSocketRoot, trustRoot, verdict };
}

function projectionReader(config: RuntimeConfig) {
  const client = createMerchantProjectionClient({
    apiUrl: config.merchantApiUrl,
    credential: config.merchantApiCredential,
    cpi: config.merchantCpi,
    fetch,
    warn: (message) => console.warn(message),
  });
  return async (argusSessionId: string): Promise<MerchantProjection | null> => {
    const result = await client.fetchProjection(argusSessionId);
    return result.ok ? result.projection : null;
  };
}

function disclosureRuntime(input: {
  config: RuntimeConfig;
  webSocketCrypto: ReturnType<typeof createWebSocketCrypto>;
  revealStore: ReturnType<typeof createDynamoRevealStore>;
}) {
  const publisher = createApiGatewayPublisher();
  return createVerdictDisclosure({
    revealKey: async (sessionId) =>
      Buffer.from(await input.webSocketCrypto.getVerdictRevealKey(sessionId), 'base64url'),
    loadRevealState: input.revealStore.load,
    publishDesktop: (connectionId, message) =>
      publisher.atEndpoint(input.config.webSocketManagementEndpoint, connectionId, message),
  });
}

function persistenceRuntime(client: DynamoDBDocumentClient, tableName: string) {
  return {
    sessions: createDynamoSessionRepository(client, tableName, nowEpochSeconds),
    attestations: createDynamoAttestationRepository(client, tableName, nowEpochSeconds),
    revealStore: createDynamoRevealStore(client, tableName),
    passkeys: createDynamoPasskeyStore(client, tableName),
    singleUseTokens: createDynamoSingleUseStore(client, tableName, nowEpochSeconds),
    phoneCommit: createDynamoPhoneCommitter(client, tableName),
    sso: createDynamoSsoRepository(client, tableName, nowEpochSeconds),
    startRateLimiter: createDynamoFixedWindowRateLimiter({
      client,
      tableName,
      nowEpochSeconds,
      max: 20,
      windowSeconds: 60,
    }),
  };
}

export async function buildSharedRuntime(config: RuntimeConfig) {
  const roots = await secretRoots(config);
  const persisted = persistenceRuntime(documentClient(), config.tableName);
  const webSocketCrypto = createWebSocketCrypto(
    Buffer.from(roots.webSocketRoot, 'utf8'),
    nowEpochSeconds
  );
  return {
    config,
    nowEpochSeconds,
    ...persisted,
    webSocketCrypto,
    verdictSecret: roots.verdict,
    disclosure: disclosureRuntime({
      config,
      webSocketCrypto,
      revealStore: persisted.revealStore,
    }),
    fetchProjection: projectionReader(config),
    attestationVerifier: createAttestationVerifier(nowEpochSeconds),
    deviceTrust: createDeviceTrustTokens(roots.trustRoot, nowEpochSeconds),
    googleOidc: createGoogleOidcVerifier({
      clientId: config.googleClientId,
      fetch,
      nowEpochSeconds,
    }),
  };
}

export type SharedRuntime = Awaited<ReturnType<typeof buildSharedRuntime>>;
