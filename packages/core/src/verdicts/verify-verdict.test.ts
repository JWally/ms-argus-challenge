import { describe, expect, it } from 'vitest';
import { signVerdict } from '../tokens/verdict-token.js';
import { verifyVerdict } from './verify-verdict.js';

const SECRET = 'test-verdict-secret';
const CPI = 'argus_cpi_live_Example12345.forceauth';
const CHALLENGE_ID = 'checkout_1234567890abcdef';

const token = signVerdict(SECRET, {
  cpi: CPI,
  challengeId: CHALLENGE_ID,
  sessionId: 'session-1',
  verdict: 'paired',
  reason: null,
});

describe('verify verdict', () => {
  const dependencies = { verdictSecret: { get: async () => SECRET } };

  it.each([
    [{}, { status: 400, body: { error: 'missing_token' } }],
    [{ token }, { status: 400, body: { error: 'missing_cpi' } }],
    [
      { token, cpi: CPI },
      { status: 400, body: { error: 'missing_challenge_id' } },
    ],
  ])('enforces required context %#', async (body, expected) => {
    await expect(verifyVerdict(body, dependencies)).resolves.toEqual(expected);
  });

  it('returns passed only for the exact merchant context', async () => {
    await expect(
      verifyVerdict({ token, cpi: CPI, challengeId: CHALLENGE_ID }, dependencies)
    ).resolves.toMatchObject({
      status: 200,
      body: {
        valid: true,
        passed: true,
        cpi: CPI,
        challengeId: CHALLENGE_ID,
        sessionId: 'session-1',
      },
    });
  });

  it('returns a non-passing response for a substituted challenge', async () => {
    await expect(
      verifyVerdict({ token, cpi: CPI, challengeId: 'checkout_A9mK3pQ7vN2xR5tZ' }, dependencies)
    ).resolves.toEqual({
      status: 200,
      body: { valid: false, reason: 'challenge_mismatch' },
    });
  });
});
