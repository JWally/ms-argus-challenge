import { describe, expect, it } from 'vitest';
import { parseSsoMerchantBinding, ssoFailureReturn } from './merchant-binding.js';

describe('SSO merchant callback binding', () => {
  it('accepts an allowlisted HTTPS callback only with an opaque challenge', () => {
    expect(
      parseSsoMerchantBinding(
        {
          merchantCallbackUrl: 'https://games.example/sso/callback?return=1',
          merchantChallengeId: 'checkout_action_123456789',
        },
        ['https://games.example']
      )
    ).toEqual({
      ok: true,
      value: {
        merchantCallbackUrl: 'https://games.example/sso/callback?return=1',
        merchantChallengeId: 'checkout_action_123456789',
      },
    });
  });

  it.each([
    ['http://games.example/callback', 'checkout_action_123456789'],
    ['https://evil.example/callback', 'checkout_action_123456789'],
    ['https://user:pass@games.example/callback', 'checkout_action_123456789'],
    ['https://games.example/callback#fragment', 'checkout_action_123456789'],
    ['https://games.example/callback', 'short'],
  ])('rejects callback %s', (merchantCallbackUrl, merchantChallengeId) => {
    expect(
      parseSsoMerchantBinding({ merchantCallbackUrl, merchantChallengeId }, [
        'https://games.example',
      ])
    ).toEqual({ ok: false });
  });

  it('builds a failure-only merchant return with server-owned bindings', () => {
    expect(
      ssoFailureReturn('session-1', 'cpi.stepup', {
        merchantCallbackUrl: 'https://games.example/sso/callback?keep=1',
        merchantChallengeId: 'checkout_action_123456789',
      })
    ).toBe(
      'https://games.example/sso/callback?keep=1&status=failed&session=session-1&cpi=cpi.stepup&challengeId=checkout_action_123456789'
    );
  });
});
