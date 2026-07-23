import { describe, expect, it, vi } from 'vitest';
import {
  createWebSocketRouter,
  type BootstrapClaims,
  type ConnectionEnvelope,
  type WebSocketEvent,
  type WebSocketRouterDependencies,
} from '@argus-challenge/core';

const NOW = 1_900_000_000;
const SESSION_ID = '01234567-89ab-cdef-0123-456789abcdef';
const ORIGIN = 'https://challenge.example';

const claims: BootstrapClaims = {
  v: 1,
  sessionId: SESSION_ID,
  role: 'desktop',
  iat: NOW - 1,
  exp: NOW + 299,
};

function envelope(role: 'desktop' | 'phone', overrides = {}): ConnectionEnvelope {
  return {
    v: 1,
    connectionId: `${role}-connection`,
    sessionId: SESSION_ID,
    role,
    ip: '203.0.113.8',
    origin: ORIGIN,
    iat: NOW - 10,
    ...overrides,
  };
}

function event(body: unknown, connectionId = 'desktop-connection'): WebSocketEvent {
  return {
    requestContext: {
      routeKey: '$default',
      connectionId,
      domainName: 'ws.example',
      stage: 'prod',
      identity: { sourceIp: '198.51.100.7' },
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function harness(overrides: Partial<WebSocketRouterDependencies> = {}) {
  const sent: Array<{ connectionId: string; data: unknown }> = [];
  const opened = new Map<string, ConnectionEnvelope>();
  const dependencies: WebSocketRouterDependencies = {
    allowedOrigins: new Set([ORIGIN]),
    verifyBootstrapToken: vi.fn(async (token) => (token === 'desktop-token' ? claims : null)),
    claimRoleConnection: vi.fn(async () => true),
    releaseRoleConnection: vi.fn(async () => undefined),
    sealEnvelope: vi.fn(async (value) => {
      opened.set('sealed', value);
      return 'sealed';
    }),
    openEnvelope: vi.fn(async (value) => opened.get(value) ?? null),
    markPhoneChallenge: vi.fn(async () => undefined),
    markPhoneDone: vi.fn(async () => undefined),
    getVerdictRevealKey: vi.fn(async () => 'reveal-key'),
    sendToConnection: vi.fn(async (_event, connectionId, data) => {
      sent.push({ connectionId, data });
    }),
    nowEpochSeconds: () => NOW,
    logInfo: vi.fn(),
    ...overrides,
  };
  return { route: createWebSocketRouter(dependencies), dependencies, sent, opened };
}

describe('WebSocket application router', () => {
  it('accepts connect and releases a disconnect claim', async () => {
    const { route, dependencies } = harness();
    const connect = event(null);
    connect.requestContext.routeKey = '$connect';
    connect.headers = { origin: ORIGIN };
    const disconnect = event(null, 'released-connection');
    disconnect.requestContext.routeKey = '$disconnect';
    await expect(route(connect)).resolves.toEqual({ statusCode: 200 });
    await expect(route(disconnect)).resolves.toEqual({ statusCode: 200 });
    expect(dependencies.releaseRoleConnection).toHaveBeenCalledWith('released-connection');
  });

  it('rejects a disallowed handshake origin before identity', async () => {
    const { route } = harness();
    const connect = event(null);
    connect.requestContext.routeKey = '$connect';
    connect.headers = { origin: 'https://attacker.example' };
    await expect(route(connect)).resolves.toEqual({
      statusCode: 403,
      body: 'origin_not_allowed',
    });
  });

  it('server-stamps authenticated identity during whoami', async () => {
    const { route, dependencies, sent } = harness();
    await expect(
      route(
        event({
          action: 'whoami',
          token: 'desktop-token',
          origin: ORIGIN,
          publicKey: 'desktop-key',
        })
      )
    ).resolves.toEqual({ statusCode: 200 });
    expect(dependencies.sealEnvelope).toHaveBeenCalledWith({
      v: 1,
      connectionId: 'desktop-connection',
      sessionId: SESSION_ID,
      role: 'desktop',
      ip: '198.51.100.7',
      origin: ORIGIN,
      iat: NOW,
      publicKey: 'desktop-key',
    });
    expect(sent[0]).toMatchObject({
      connectionId: 'desktop-connection',
      data: { action: 'whoami', role: 'desktop', sessionId: SESSION_ID },
    });
  });

  it('rejects a declared origin that contradicts the handshake origin', async () => {
    const { route } = harness();
    const identity = event({
      action: 'whoami',
      token: 'desktop-token',
      origin: ORIGIN,
    });
    identity.headers = { origin: 'https://different.example' };
    await expect(route(identity)).resolves.toEqual({
      statusCode: 400,
      body: 'origin_mismatch',
    });
  });

  it.each([
    [{ action: 'whoami', origin: ORIGIN }, 'missing_token'],
    [{ action: 'whoami', token: 'bad', origin: ORIGIN }, 'invalid_token'],
    [
      { action: 'whoami', token: 'desktop-token', origin: 'https://evil.example' },
      'origin_not_allowed',
    ],
  ])('rejects invalid identity request %#', async (body, error) => {
    const { route } = harness();
    await expect(route(event(body))).resolves.toEqual({ statusCode: 400, body: error });
  });

  it('relays only between authenticated opposite-role peers in one session', async () => {
    const { route, opened, sent } = harness();
    opened.set('desktop', envelope('desktop'));
    opened.set('phone', envelope('phone'));
    const data = { kind: 'desktop-ready', nonce: 'nonce-1' };
    await expect(
      route(event({ action: 'message', me: 'desktop', peer: 'phone', data }))
    ).resolves.toEqual({ statusCode: 200 });
    expect(sent).toEqual([
      {
        connectionId: 'phone-connection',
        data: {
          action: 'message',
          from: 'desktop',
          fromEnvelope: 'desktop',
          sessionId: SESSION_ID,
          data,
        },
      },
    ]);
  });

  it.each([
    [
      envelope('desktop', { connectionId: 'stolen' }),
      envelope('phone'),
      'envelope_connection_mismatch',
    ],
    [envelope('desktop'), envelope('phone', { sessionId: 'other' }), 'cross_session'],
    [envelope('desktop'), envelope('desktop', { connectionId: 'other' }), 'same_role'],
    [envelope('desktop', { iat: NOW - 301 }), envelope('phone'), 'envelope_expired'],
  ])('rejects invalid relay policy %#', async (sender, peer, error) => {
    const { route, opened } = harness();
    opened.set('sender', sender);
    opened.set('peer', peer);
    await expect(
      route(event({ action: 'message', me: 'sender', peer: 'peer', data: {} }))
    ).resolves.toEqual({ statusCode: 400, body: error });
  });

  it('releases a verdict only after an authenticated phone-done signal', async () => {
    const { route, opened, dependencies, sent } = harness();
    opened.set('phone', envelope('phone'));
    opened.set('desktop', envelope('desktop'));
    await route(
      event(
        { action: 'message', me: 'phone', peer: 'desktop', data: { kind: 'phone-done' } },
        'phone-connection'
      )
    );
    expect(dependencies.markPhoneDone).toHaveBeenCalledWith(SESSION_ID, NOW + 360);
    expect(sent).toHaveLength(3);
    expect(sent.slice(1).map(({ connectionId }) => connectionId)).toEqual([
      'desktop-connection',
      'phone-connection',
    ]);
  });
});
