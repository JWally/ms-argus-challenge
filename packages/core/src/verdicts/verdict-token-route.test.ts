import { describe, expect, it, vi } from 'vitest';
import {
  createVerdictTokenHandler,
  type VerdictTokenRouteDependencies,
} from './verdict-token-route.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const event = { queryStringParameters: { t: 'desktop-token' } };

function dependencies(overrides: Partial<VerdictTokenRouteDependencies> = {}) {
  return {
    loadSession: vi.fn().mockResolvedValue({
      cpi: 'argus_cpi_test_Example12345.stepup',
      challengeId: 'checkout_action_123456789',
      verdict: 'paired',
      verdictReason: 'paired_desktop_and_phone',
      phoneAttestation: { receivedAt: 1_900_000_000 },
    }),
    verifyParticipant: vi.fn().mockResolvedValue({ sessionId: SESSION_ID }),
    isReleased: vi.fn().mockResolvedValue(true),
    getSecret: vi.fn().mockResolvedValue('verdict-secret'),
    nowEpochSeconds: () => 1_900_000_010,
    ...overrides,
  } satisfies VerdictTokenRouteDependencies;
}

describe('verdict token route', () => {
  it('authenticates and withholds completion until reveal policy permits it', async () => {
    const unauthorized = dependencies({ verifyParticipant: vi.fn().mockResolvedValue(null) });
    await expect(createVerdictTokenHandler(unauthorized)(event, SESSION_ID)).resolves.toEqual({
      status: 401,
      body: { error: 'verdict_token_unauthorized' },
    });
    const held = dependencies({ isReleased: vi.fn().mockResolvedValue(false) });
    await expect(createVerdictTokenHandler(held)(event, SESSION_ID)).resolves.toEqual({
      status: 409,
      body: { error: 'verdict_pending' },
    });
  });

  it('mints a context-bound server token after release', async () => {
    const response = await createVerdictTokenHandler(dependencies())(event, SESSION_ID);
    expect(response).toMatchObject({ status: 200, body: { token: expect.any(String) } });
  });

  it.each([
    [null, 404, 'session_not_found'],
    [{ verdict: 'pending' }, 409, 'verdict_pending'],
    [{ verdict: 'paired', challengeId: '' }, 409, 'challenge_binding_missing'],
  ] as const)('maps incomplete session %#', async (session, status, error) => {
    const deps = dependencies({ loadSession: vi.fn().mockResolvedValue(session) });
    await expect(createVerdictTokenHandler(deps)(event, SESSION_ID)).resolves.toEqual({
      status,
      body: { error },
    });
  });
});
