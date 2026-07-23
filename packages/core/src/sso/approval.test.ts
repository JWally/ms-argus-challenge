import { describe, expect, it, vi } from 'vitest';
import {
  approvalCookie,
  checkApproval,
  createSsoApprovalExchangeHandler,
  createSsoApprovalRedemptionHandler,
  hashApprovalToken,
  readApprovalCookie,
} from './approval.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CPI = 'argus_cpi_test_Example12345.stepup';
const TOKEN = 'approval-token';
const session = {
  verdict: 'approved' as const,
  cpi: CPI,
  merchantSessionId: 'merchant-session',
  merchantCallbackUrl: 'https://games.example/callback',
  merchantChallengeId: 'checkout_action_123456789',
  approvalTokenHash: hashApprovalToken(TOKEN),
};

describe('SSO approval', () => {
  it('uses a secure, strict, path-scoped cookie and parses encoded values', () => {
    const cookie = approvalCookie('token with space', 600);
    expect(cookie).toContain(
      '__Secure-argus_sso_approval=token%20with%20space; Path=/api/sso/approval/redeem'
    );
    expect(cookie).toContain('Secure; HttpOnly; SameSite=Strict');
    expect(readApprovalCookie([cookie])).toBe('token with space');
    expect(readApprovalCookie(['unrelated=value'])).toBeNull();
    expect(readApprovalCookie(['__Secure-argus_sso_approval=%E0%A4%A'])).toBeNull();
  });

  it.each([
    [{ ...session, verdict: 'pending' as const }, TOKEN, CPI, 'not_approved'],
    [{ ...session, approvalRedeemedAt: 1 }, TOKEN, CPI, 'consumed'],
    [{ ...session, approvalTokenHash: undefined }, TOKEN, CPI, 'missing'],
    [session, 'wrong-token', CPI, 'invalid'],
    [{ ...session, cpi: undefined }, TOKEN, CPI, 'cpi_missing'],
    [session, TOKEN, 'argus_cpi_test_Other12345', 'cpi_mismatch'],
  ] as const)('classifies invalid state %#', (state, token, cpi, expected) => {
    expect(checkApproval(state, token, cpi)).toBe(expected);
  });

  it('redeems the cookie atomically and clears it', async () => {
    const consumeApproval = vi.fn().mockResolvedValue(true);
    const handler = createSsoApprovalRedemptionHandler({
      loadSession: vi.fn().mockResolvedValue(session),
      consumeApproval,
    });
    await expect(
      handler({ sessionId: SESSION_ID, cpi: CPI }, [approvalCookie(TOKEN, 600)])
    ).resolves.toMatchObject({
      status: 200,
      body: { verdict: 'approved', scope: 'stepup' },
      cookies: [expect.stringContaining('Max-Age=0')],
    });
    expect(consumeApproval).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      cpi: CPI,
      token: TOKEN,
    });
  });

  it('rejects incomplete, expired, and non-atomic cookie redemptions', async () => {
    const cookie = [approvalCookie(TOKEN, 600)];
    const missing = createSsoApprovalRedemptionHandler({
      loadSession: vi.fn().mockResolvedValue(null),
      consumeApproval: vi.fn(),
    });
    await expect(missing({}, cookie)).resolves.toMatchObject({
      status: 400,
      body: { error: 'missing_cpi' },
    });
    await expect(missing({ cpi: 'bad' }, cookie)).resolves.toMatchObject({ status: 400 });
    await expect(missing({ sessionId: SESSION_ID, cpi: CPI }, [])).resolves.toMatchObject({
      status: 401,
      body: { error: 'sso_approval_missing' },
    });
    await expect(missing({ sessionId: SESSION_ID, cpi: CPI }, cookie)).resolves.toMatchObject({
      status: 410,
      body: { error: 'sso_session_not_found' },
    });

    const invalid = createSsoApprovalRedemptionHandler({
      loadSession: vi.fn().mockResolvedValue({ ...session, verdict: 'failed' }),
      consumeApproval: vi.fn(),
    });
    await expect(invalid({ sessionId: SESSION_ID, cpi: CPI }, cookie)).resolves.toMatchObject({
      status: 409,
      body: { error: 'sso_approval_not_approved' },
    });

    const raced = createSsoApprovalRedemptionHandler({
      loadSession: vi.fn().mockResolvedValue(session),
      consumeApproval: vi.fn().mockResolvedValue(false),
    });
    await expect(raced({ sessionId: SESSION_ID, cpi: CPI }, cookie)).resolves.toMatchObject({
      status: 409,
      body: { error: 'sso_approval_invalid_or_consumed' },
    });
  });

  it('exchanges a merchant-bound code and challenge atomically', async () => {
    const consumeApproval = vi.fn().mockResolvedValue(true);
    const handler = createSsoApprovalExchangeHandler({
      loadSession: vi.fn().mockResolvedValue(session),
      consumeApproval,
    });
    await expect(
      handler({
        sessionId: SESSION_ID,
        code: TOKEN,
        cpi: CPI,
        challengeId: 'checkout_action_123456789',
      })
    ).resolves.toMatchObject({
      status: 200,
      body: {
        valid: true,
        passed: true,
        merchantSessionId: 'merchant-session',
        challengeId: 'checkout_action_123456789',
      },
    });
    expect(consumeApproval).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: 'checkout_action_123456789' })
    );
  });

  it('fails every broken merchant exchange binding closed', async () => {
    const body = {
      sessionId: SESSION_ID,
      code: TOKEN,
      cpi: CPI,
      challengeId: 'checkout_action_123456789',
    };
    const missing = createSsoApprovalExchangeHandler({
      loadSession: vi.fn().mockResolvedValue(null),
      consumeApproval: vi.fn(),
    });
    await expect(missing({ ...body, code: '' })).resolves.toMatchObject({ status: 400 });
    await expect(missing(body)).resolves.toMatchObject({
      status: 410,
      body: { error: 'sso_session_not_found' },
    });

    const responseFor = async (state: object, request = body, consumed = true) => {
      const handler = createSsoApprovalExchangeHandler({
        loadSession: vi.fn().mockResolvedValue(state),
        consumeApproval: vi.fn().mockResolvedValue(consumed),
      });
      return handler(request);
    };
    await expect(
      responseFor({ ...session, merchantCallbackUrl: undefined })
    ).resolves.toMatchObject({ status: 409, body: { error: 'sso_approval_not_merchant_bound' } });
    await expect(
      responseFor({ ...session, merchantChallengeId: 'different_challenge_1234' })
    ).resolves.toMatchObject({ status: 409, body: { error: 'sso_approval_challenge_mismatch' } });
    await expect(responseFor(session, { ...body, code: 'wrong' })).resolves.toMatchObject({
      status: 409,
      body: { error: 'sso_approval_invalid' },
    });
    await expect(responseFor(session, body, false)).resolves.toMatchObject({
      status: 409,
      body: { error: 'sso_approval_invalid_or_consumed' },
    });
  });
});
