import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod, type CfnStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

interface RouteDefinition {
  method: string;
  path: string;
}

export const CHALLENGE_ROUTES: readonly RouteDefinition[] = [
  { method: 'POST', path: '/api/session/start' },
  { method: 'POST', path: '/api/sso/start' },
  { method: 'POST', path: '/api/sso/{id}/challenge' },
  { method: 'POST', path: '/api/sso/{id}/validate' },
  { method: 'POST', path: '/api/sso/approval/redeem' },
  { method: 'POST', path: '/api/sso/approval/exchange' },
  { method: 'GET', path: '/api/session/{id}/info' },
  { method: 'GET', path: '/api/session/{id}/verdict-token' },
  { method: 'POST', path: '/api/verify' },
  { method: 'POST', path: '/api/session/{id}/pair-token' },
  { method: 'POST', path: '/api/pair-token/redeem' },
  { method: 'POST', path: '/api/phone-perf' },
  { method: 'POST', path: '/api/sso/telemetry' },
  { method: 'POST', path: '/api/session/{id}/desktop-attest' },
  { method: 'POST', path: '/api/session/{id}/phone-attest' },
  { method: 'GET', path: '/api/session/{id}/result' },
  { method: 'ANY', path: '/api/{proxy+}' },
];

function method(value: string): HttpMethod {
  return value === 'ANY' ? HttpMethod.ANY : HttpMethod[value as keyof typeof HttpMethod];
}

export function createHttpApi(
  scope: Construct,
  handler: IFunction,
  allowedOrigins: string[]
): HttpApi {
  const api = new HttpApi(scope, 'HttpApi', {
    corsPreflight: {
      allowOrigins: allowedOrigins,
      allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
      allowHeaders: ['content-type', 'authorization'],
      maxAge: Duration.hours(1),
    },
  });
  const integration = new HttpLambdaIntegration('HttpIntegration', handler);
  for (const route of CHALLENGE_ROUTES) {
    api.addRoutes({ path: route.path, methods: [method(route.method)], integration });
  }
  const logs = new LogGroup(scope, 'HttpAccessLogs', {
    retention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const stage = api.defaultStage?.node.defaultChild as CfnStage;
  stage.defaultRouteSettings = { throttlingBurstLimit: 60, throttlingRateLimit: 30 };
  stage.accessLogSettings = {
    destinationArn: logs.logGroupArn,
    format: JSON.stringify({
      requestId: '$context.requestId',
      routeKey: '$context.routeKey',
      status: '$context.status',
      integrationStatus: '$context.integrationStatus',
      error: '$context.integrationErrorMessage',
    }),
  };
  return api;
}
