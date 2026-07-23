import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime, type IFunction } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';
import type { ChallengeDeploymentConfig } from './deployment-config.js';
import { createHttpApi } from './http-api.js';
import { createRecurringAliasHeater } from './recurring-alias-heater.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repository = join(moduleDirectory, '../..');

function functionDefaults(nodeModules: string[] = []) {
  return {
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    timeout: Duration.seconds(15),
    bundling: {
      minify: true,
      sourceMap: false,
      target: 'node22',
      ...(nodeModules.length > 0
        ? {
            nodeModules,
            // Local CDK bundling otherwise installs host-x64 optional packages
            // even though this function deploys on arm64.
            environment: {
              npm_config_cpu: 'arm64',
              npm_config_os: 'linux',
              npm_config_libc: 'glibc',
            },
          }
        : {}),
    },
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
  // CDK stages native modules from the entrypoint workspace, so apps/api keeps
  // a direct sharp packaging dependency in addition to the adapter dependency.
  const handler = new NodejsFunction(scope, 'HttpFunction', {
    ...functionDefaults(['sharp']),
    entry: join(repository, 'apps/api/src/handler.ts'),
    handler: 'handler',
    memorySize: 2048,
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
  const live = handler.addAlias('live');
  // Alias implements IFunction; this narrows a CDK declaration mismatch exposed
  // by exactOptionalPropertyTypes around its optional role property.
  const liveTarget = live as IFunction;
  const api = createHttpApi(scope, liveTarget, [config.publicOrigin]);
  createRecurringAliasHeater(scope, 'HttpHeater', {
    ruleName: `${Stack.of(scope).stackName}-http-heater`,
    target: liveTarget,
    invokesPerMinute: 6,
    spacingSeconds: 10,
    warmupPayload: { source: 'argus.challenge.warmup' },
  });
  return { handler, live, api };
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
