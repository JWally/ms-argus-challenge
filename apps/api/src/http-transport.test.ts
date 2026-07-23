import { describe, expect, it } from 'vitest';
import { toApiEvent, toLambdaResponse } from './http-transport.js';

describe('Lambda HTTP transport', () => {
  it('normalizes API Gateway v2 routing and base64 bodies', () => {
    expect(
      toApiEvent({
        requestContext: {
          routeKey: 'POST /api/session/start',
          http: { sourceIp: '203.0.113.8' },
        },
        pathParameters: { id: 'session-1' },
        headers: { origin: 'https://challenge.example' },
        body: Buffer.from('{"hello":"world"}').toString('base64'),
        isBase64Encoded: true,
      })
    ).toMatchObject({
      routeKey: 'POST /api/session/start',
      body: '{"hello":"world"}',
      requestContext: { http: { sourceIp: '203.0.113.8' } },
    });
  });

  it('serializes JSON, cookies, security headers, and an empty 204', () => {
    expect(
      toLambdaResponse({
        status: 200,
        body: { ok: true },
        cookies: ['secure-cookie'],
        headers: { 'x-custom': 'value' },
      })
    ).toEqual({
      statusCode: 200,
      headers: expect.objectContaining({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-custom': 'value',
      }),
      cookies: ['secure-cookie'],
      body: '{"ok":true}',
    });
    expect(toLambdaResponse({ status: 204, body: null })).not.toHaveProperty('body');
  });
});
