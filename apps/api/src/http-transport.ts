import type { ApplicationResponse, ChallengeApiEvent } from '@argus-challenge/core';

export interface GatewayEvent {
  requestContext: {
    routeKey: string;
    http?: { sourceIp?: string };
    identity?: { sourceIp?: string };
  };
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body?: string;
}

export function toApiEvent(event: GatewayEvent): ChallengeApiEvent {
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : undefined;
  return {
    routeKey: event.requestContext.routeKey,
    ...(event.pathParameters ? { pathParameters: event.pathParameters } : {}),
    ...(event.queryStringParameters ? { queryStringParameters: event.queryStringParameters } : {}),
    ...(event.headers ? { headers: event.headers } : {}),
    ...(event.cookies ? { cookies: event.cookies } : {}),
    ...(body !== undefined ? { body } : {}),
    requestContext: {
      ...(event.requestContext.http ? { http: event.requestContext.http } : {}),
      ...(event.requestContext.identity ? { identity: event.requestContext.identity } : {}),
    },
  };
}

export function toLambdaResponse(
  response: ApplicationResponse<Record<string, unknown> | null>
): LambdaResponse {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...response.headers,
  };
  return {
    statusCode: response.status,
    headers,
    ...(response.cookies ? { cookies: response.cookies } : {}),
    ...(response.status === 204 || response.body === null
      ? {}
      : { body: JSON.stringify(response.body) }),
  };
}
