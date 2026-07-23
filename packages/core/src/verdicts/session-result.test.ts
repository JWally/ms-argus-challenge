import { describe, expect, it, vi } from 'vitest';
import { createSessionResultHandler, type SessionResultDependencies } from './session-result.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function dependencies(
  overrides: Partial<SessionResultDependencies> = {}
): SessionResultDependencies {
  return {
    authenticateParticipant: vi.fn().mockResolvedValue(true),
    loadSession: vi.fn().mockResolvedValue({ verdict: 'pending' }),
    sealResult: vi.fn().mockResolvedValue({ status: 'sealed', envelope: 'sealed' }),
    nowEpochSeconds: () => 1_900_000_000,
    ...overrides,
  };
}

describe('session result fallback', () => {
  it('requires participant authentication before reading state', async () => {
    const deps = dependencies({ authenticateParticipant: vi.fn().mockResolvedValue(false) });
    await expect(createSessionResultHandler(deps)({}, SESSION_ID)).resolves.toEqual({
      status: 401,
      body: { error: 'result_unauthorized' },
    });
    expect(deps.loadSession).not.toHaveBeenCalled();
  });

  it.each([
    [null, { status: 410, body: { error: 'session_expired' } }],
    [{ verdict: 'pending' }, { status: 204, body: null }],
  ] as const)('maps session state %#', async (session, response) => {
    const deps = dependencies({ loadSession: vi.fn().mockResolvedValue(session) });
    await expect(createSessionResultHandler(deps)({}, SESSION_ID)).resolves.toEqual(response);
  });

  it('returns only a sealed decision for a completed session', async () => {
    const deps = dependencies({
      loadSession: vi.fn().mockResolvedValue({
        verdict: 'failed',
        verdictReason: 'phone_on_proxy',
        annotations: { phone_is_proxy: true },
        phoneAttestation: { receivedAt: 1_899_999_990 },
      }),
    });
    await expect(createSessionResultHandler(deps)({}, SESSION_ID)).resolves.toEqual({
      status: 200,
      body: { status: 'sealed', envelope: 'sealed' },
    });
    expect(deps.sealResult).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      verdict: 'failed',
      reason: 'phone_on_proxy',
      annotations: { phone_is_proxy: true },
      nextDeviceTrust: null,
      decidedAt: 1_899_999_990,
      now: 1_900_000_000,
    });
  });
});
