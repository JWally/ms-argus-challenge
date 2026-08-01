import { describe, expect, it, vi } from 'vitest';
import {
  createChallengeApiRouter,
  type ChallengeApiEvent,
  type ChallengeApiRouterDependencies,
} from '@argus-challenge/core';

const SESSION_ID = '01234567-89ab-cdef-0123-456789abcdef';

function response(name: string) {
  return { status: 200, body: { handler: name } };
}

function dependencies(): ChallengeApiRouterDependencies {
  return {
    allowOrigin: vi.fn(() => true),
    handleTelemetry: vi.fn(() => null),
    startSession: vi.fn(async () => response('startSession')),
    startSso: vi.fn(async () => response('startSso')),
    challengeSso: vi.fn(async () => response('challengeSso')),
    validateSso: vi.fn(async () => response('validateSso')),
    redeemSsoApproval: vi.fn(async () => response('redeemSsoApproval')),
    exchangeSsoApproval: vi.fn(async () => response('exchangeSsoApproval')),
    loadSession: vi.fn(async () => ({
      expiresAt: 1_900_000_300,
      verdict: 'pending',
      desktopAttestation: {},
    })),
    attestDesktop: vi.fn(async () => response('attestDesktop')),
    attestPhone: vi.fn(async () => response('attestPhone')),
    getDrawingPictures: vi.fn(async () => response('getDrawingPictures')),
    getSessionResult: vi.fn(async () => response('getSessionResult')),
    mintPairToken: vi.fn(async () => response('mintPairToken')),
    redeemPairToken: vi.fn(async () => ({ sessionId: SESSION_ID })),
    mintVerdictToken: vi.fn(async () => response('mintVerdictToken')),
    verifyVerdict: vi.fn(async () => response('verifyVerdict')),
  };
}

function event(routeKey: string, overrides: Partial<ChallengeApiEvent> = {}): ChallengeApiEvent {
  return {
    routeKey,
    ...(routeKey.includes('{id}') ? { pathParameters: { id: SESSION_ID } } : {}),
    requestContext: { http: { sourceIp: '203.0.113.8' } },
    ...overrides,
  };
}

describe('HTTP application router', () => {
  it('rejects explicit disallowed origins before parsing or dispatch', async () => {
    const deps = dependencies();
    deps.allowOrigin = vi.fn(() => false);
    const route = createChallengeApiRouter(deps);
    await expect(route(event('POST /api/session/start', { body: '{not-json' }))).resolves.toEqual({
      status: 403,
      body: { error: 'origin_not_allowed' },
    });
    expect(deps.startSession).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and oversized request bodies', async () => {
    const route = createChallengeApiRouter(dependencies());
    await expect(route(event('POST /api/session/start', { body: '{not-json' }))).resolves.toEqual({
      status: 400,
      body: { error: 'invalid_body' },
    });
    await expect(
      route(event('POST /api/session/start', { body: `{"x":"${'a'.repeat(17_000)}"}` }))
    ).resolves.toEqual({ status: 400, body: { error: 'invalid_body' } });
  });

  it('returns Pair-compatible public session info', async () => {
    const route = createChallengeApiRouter(dependencies());
    await expect(route(event('GET /api/session/{id}/info'))).resolves.toEqual({
      status: 200,
      body: { expiresAt: 1_900_000_300, desktopReady: true, verdict: 'pending' },
    });
  });

  it.each([
    ['POST /api/session/start', 'startSession'],
    ['POST /api/sso/start', 'startSso'],
    ['POST /api/sso/{id}/challenge', 'challengeSso'],
    ['POST /api/sso/{id}/validate', 'validateSso'],
    ['POST /api/sso/approval/redeem', 'redeemSsoApproval'],
    ['POST /api/sso/approval/exchange', 'exchangeSsoApproval'],
    ['POST /api/session/{id}/desktop-attest', 'attestDesktop'],
    ['POST /api/session/{id}/phone-attest', 'attestPhone'],
    ['POST /api/session/{id}/drawing-pictures', 'getDrawingPictures'],
    ['GET /api/session/{id}/result', 'getSessionResult'],
    ['POST /api/session/{id}/pair-token', 'mintPairToken'],
    ['GET /api/session/{id}/verdict-token', 'mintVerdictToken'],
    ['POST /api/verify', 'verifyVerdict'],
  ])('dispatches %s to %s', async (routeKey, handlerName) => {
    const route = createChallengeApiRouter(dependencies());
    await expect(route(event(routeKey, { body: '{}' }))).resolves.toEqual(response(handlerName));
  });

  it('retains pair-token redemption status semantics', async () => {
    const deps = dependencies();
    const route = createChallengeApiRouter(deps);
    await expect(route(event('POST /api/pair-token/redeem', { body: '{}' }))).resolves.toEqual({
      status: 400,
      body: { error: 'missing_token' },
    });
    deps.redeemPairToken = vi.fn(async () => null);
    await expect(
      route(
        event('POST /api/pair-token/redeem', {
          body: JSON.stringify({ token: 'this-is-a-valid-shape' }),
        })
      )
    ).resolves.toEqual({ status: 410, body: { error: 'token_expired_or_used' } });
  });

  it('rejects non-UUID path IDs and returns JSON for route drift', async () => {
    const route = createChallengeApiRouter(dependencies());
    await expect(
      route(event('GET /api/session/{id}/info', { pathParameters: { id: 'not-a-uuid' } }))
    ).resolves.toEqual({ status: 400, body: { error: 'invalid_session_id' } });
    await expect(route(event('ANY /api/{proxy+}'))).resolves.toEqual({
      status: 400,
      body: { error: 'invalid_session_id' },
    });
    await expect(
      route(event('GET /api/unknown/{id}', { pathParameters: { id: SESSION_ID } }))
    ).resolves.toEqual({
      status: 200,
      body: { error: 'no_matching_route', routeKey: 'GET /api/unknown/{id}' },
    });
  });
});
