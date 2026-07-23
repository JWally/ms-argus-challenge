import { describe, expect, it, vi } from 'vitest';
import { startSession, type StartSessionDependencies } from './start-session.js';

const SESSION_ID = '4f4cf495-a98b-4b76-9099-8ad59dc85ccb';
const CHALLENGE_ID = 'checkout_action_123456789';

function dependencies(overrides: Partial<StartSessionDependencies> = {}): StartSessionDependencies {
  return {
    rateLimiter: { allow: vi.fn().mockResolvedValue(true) },
    sessions: { create: vi.fn().mockResolvedValue({ ok: true }) },
    bootstrapTokens: { mint: vi.fn(async (_sessionId, role) => `${role}-token`) },
    ids: { sessionId: () => SESSION_ID, nonce: () => 'nonce-1' },
    clock: { nowEpochSeconds: () => 1_900_000_000 },
    sessionTtlSeconds: 300,
    proofRequiredByDefault: false,
    webSocketUrl: 'wss://challenge.example.test',
    logger: { warn: vi.fn(), info: vi.fn() },
    ...overrides,
  };
}

describe('start session', () => {
  it('stores server-owned forceauth policy and mints role-bound tokens', async () => {
    const deps = dependencies();
    const response = await startSession(
      {
        challengeId: CHALLENGE_ID,
        cpi: 'argus_cpi_test_Example12345.forceauth',
        hostPreflightRequired: true,
        hostOrigin: 'https://merchant.example',
      },
      '203.0.113.8',
      deps
    );

    expect(deps.sessions.create).toHaveBeenCalledWith({
      id: SESSION_ID,
      nonce: 'nonce-1',
      expiresAt: 1_900_000_300,
      challengeId: CHALLENGE_ID,
      cpi: 'argus_cpi_test_Example12345.forceauth',
      proofRequired: true,
      freshProofRequired: true,
      hostPreflightRequired: true,
      hostOrigin: 'https://merchant.example',
      verdict: 'pending',
    });
    expect(response).toEqual({
      status: 200,
      body: {
        sessionId: SESSION_ID,
        nonce: 'nonce-1',
        expiresAt: 1_900_000_300,
        ws: {
          url: 'wss://challenge.example.test',
          desktopToken: 'desktop-token',
          phoneToken: 'phone-token',
        },
      },
    });
  });

  it.each([
    [{}, { error: 'missing_challenge_id' }],
    [{ challengeId: 'short' }, { error: 'invalid_challenge_id' }],
    [{ challengeId: CHALLENGE_ID, cpi: 'bad' }, { error: 'invalid_cpi' }],
    [
      { challengeId: CHALLENGE_ID, hostPreflightRequired: true },
      { error: 'host_preflight_requires_cpi' },
    ],
    [
      {
        challengeId: CHALLENGE_ID,
        cpi: 'argus_cpi_test_Example12345',
        hostPreflightRequired: true,
        hostOrigin: 'http://merchant.example',
      },
      { error: 'host_preflight_origin_invalid' },
    ],
  ])('rejects invalid request %# before persistence', async (body, error) => {
    const deps = dependencies();
    await expect(startSession(body, '203.0.113.8', deps)).resolves.toEqual({
      status: 400,
      body: error,
    });
    expect(deps.sessions.create).not.toHaveBeenCalled();
  });

  it('returns the exact over-cap response before request validation', async () => {
    const deps = dependencies({ rateLimiter: { allow: vi.fn().mockResolvedValue(false) } });
    await expect(startSession({}, '203.0.113.8', deps)).resolves.toEqual({
      status: 429,
      body: { error: 'rate_limited', scope: 'session_start' },
    });
  });

  it('fails closed when the rate-limit store is unavailable', async () => {
    const logger = { warn: vi.fn(), info: vi.fn() };
    const deps = dependencies({
      rateLimiter: { allow: vi.fn().mockRejectedValue(new Error('rate-limit store unavailable')) },
      logger,
    });
    await expect(startSession({ challengeId: CHALLENGE_ID }, '203.0.113.8', deps)).resolves.toEqual(
      {
        status: 503,
        body: { error: 'rate_limit_unavailable' },
      }
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[challenge] session-start rate-limit check failed closed: rate-limit store unavailable'
    );
    expect(deps.sessions.create).not.toHaveBeenCalled();
  });
});
