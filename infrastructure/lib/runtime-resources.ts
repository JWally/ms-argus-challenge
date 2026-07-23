import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';
import type { ChallengeDeploymentConfig } from './deployment-config.js';
import { createHttpApi } from './http-api.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repository = join(moduleDirectory, '../..');

function functionDefaults() {
  return {
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    timeout: Duration.seconds(15),
    bundling: { minify: true, sourceMap: false, target: 'node22' },
    depsLockFilePath: join(repository, 'package-lock.json'),
    projectRoot: repository,
  };
}

function createState(scope: Construct) {
  const table = new Table(scope, 'StateTable', {
    partitionKey: { name: 'PK', type: AttributeType.STRING },
    sortKey: { name: 'SK', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    timeToLiveAttribute: 'expiresAt',
    pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const secret = (id: string, description: string) =>
    new Secret(scope, id, {
      description,
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
  return {
    table,
    webSocketSecret: secret('WebSocketSecret', 'Challenge WebSocket envelope root'),
    trustSecret: secret('DeviceTrustSecret', 'Challenge device-trust signing root'),
    verdictSecret: secret('VerdictSecret', 'Challenge verdict-token signing root'),
  };
}

function createWebSocketRuntime(
  scope: Construct,
  table: Table,
  webSocketSecret: Secret,
  origin: string
) {
  const handler = new NodejsFunction(scope, 'WebSocketFunction', {
    ...functionDefaults(),
    entry: join(repository, 'apps/api/src/websocket-handler.ts'),
    handler: 'handler',
    memorySize: 512,
    environment: {
      TABLE_NAME: table.tableName,
      ALLOWED_ORIGINS: origin,
      WS_SECRET_ARN: webSocketSecret.secretArn,
    },
  });
  const api = new WebSocketApi(scope, 'WebSocketApi', {
    routeSelectionExpression: '$request.body.action',
    connectRouteOptions: {
      integration: new WebSocketLambdaIntegration('WebSocketConnectIntegration', handler),
    },
    disconnectRouteOptions: {
      integration: new WebSocketLambdaIntegration('WebSocketDisconnectIntegration', handler),
    },
    defaultRouteOptions: {
      integration: new WebSocketLambdaIntegration('WebSocketDefaultIntegration', handler),
    },
  });
  new WebSocketStage(scope, 'WebSocketStage', {
    webSocketApi: api,
    stageName: 'live',
    autoDeploy: true,
  });
  table.grantReadWriteData(handler);
  webSocketSecret.grantRead(handler);
  api.grantManageConnections(handler);
  return { handler, api, url: `${api.apiEndpoint}/live` };
}

function createHttpRuntime(input: {
  scope: Construct;
  config: ChallengeDeploymentConfig;
  state: ReturnType<typeof createState>;
  webSocket: ReturnType<typeof createWebSocketRuntime>;
}) {
  const { scope, config, state, webSocket } = input;
  const region = Stack.of(scope).region;
  const handler = new NodejsFunction(scope, 'HttpFunction', {
    ...functionDefaults(),
    entry: join(repository, 'apps/api/src/handler.ts'),
    handler: 'handler',
    memorySize: 1536,
    environment: {
      TABLE_NAME: state.table.tableName,
      PUBLIC_ORIGIN: config.publicOrigin,
      ALLOWED_ORIGINS: config.publicOrigin,
      SSO_CALLBACK_ORIGINS: config.ssoCallbackOrigins.join(','),
      WS_API_URL: webSocket.url,
      WS_MGMT_ENDPOINT: `https://${webSocket.api.apiId}.execute-api.${region}.amazonaws.com/live`,
      WS_SECRET_ARN: state.webSocketSecret.secretArn,
      DEVICE_TRUST_SECRET_ARN: state.trustSecret.secretArn,
      VERDICT_SECRET_ARN: state.verdictSecret.secretArn,
      MERCHANT_API_URL: config.merchantApiUrl,
      MERCHANT_API_CREDENTIAL: config.merchantApiCredential,
      MERCHANT_CPI: config.merchantCpi,
      OAUTH_GOOGLE_CLIENT_ID: config.googleClientId,
      REQUIRE_PROOF_OF_LIFE: 'false',
      ALLOW_TEST_AUTHENTICATORS: 'true',
    },
  });
  state.table.grantReadWriteData(handler);
  state.webSocketSecret.grantRead(handler);
  state.trustSecret.grantRead(handler);
  state.verdictSecret.grantRead(handler);
  webSocket.api.grantManageConnections(handler);
  return { handler, api: createHttpApi(scope, handler, [config.publicOrigin]) };
}

export function createChallengeRuntime(scope: Construct, config: ChallengeDeploymentConfig) {
  const state = createState(scope);
  const webSocket = createWebSocketRuntime(
    scope,
    state.table,
    state.webSocketSecret,
    config.publicOrigin
  );
  const http = createHttpRuntime({ scope, config, state, webSocket });
  return { state, webSocket, http };
}
