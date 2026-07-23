import { describe, expect, it } from 'vitest';
import { signVerdict, verifyVerdictForContext, verifyVerdictToken } from './verdict-token.js';

const NOW = Date.UTC(2030, 0, 1);
const input = {
  cpi: 'argus_cpi_test_AbC123xYz789.stepup',
  challengeId: 'checkout_action_123456789',
  sessionId: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
  verdict: 'paired',
  reason: null,
};

describe('verdict token', () => {
  it('round-trips the Pair-compatible claims and five-minute lifetime', () => {
    const token = signVerdict('test-secret', input, NOW);
    expect(verifyVerdictToken('test-secret', token, NOW)).toEqual({
      ok: true,
      claims: { ...input, iat: 1_893_456_000, exp: 1_893_456_300 },
    });
  });

  it.each([
    ['wrong secret', 'other-secret', NOW, 'bad_signature'],
    ['expired', 'test-secret', NOW + 301_000, 'expired'],
  ])('rejects %s', (_label, secret, now, reason) => {
    const token = signVerdict('test-secret', input, NOW);
    expect(verifyVerdictToken(secret, token, now)).toEqual({ ok: false, reason });
  });

  it('binds verification to CPI and protected challenge', () => {
    const token = signVerdict('test-secret', input, NOW);
    expect(
      verifyVerdictForContext(
        'test-secret',
        token,
        { cpi: `${input.cpi}.different`, challengeId: input.challengeId },
        NOW
      )
    ).toEqual({ ok: false, reason: 'cpi_mismatch' });
    expect(
      verifyVerdictForContext(
        'test-secret',
        token,
        { cpi: input.cpi, challengeId: 'another_action_123456789' },
        NOW
      )
    ).toEqual({ ok: false, reason: 'challenge_mismatch' });
  });
});
