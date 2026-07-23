import { describe, expect, it } from 'vitest';
import { validationDestination, type SsoValidateResponse } from './sso-client.js';
import type { SsoBrowserState } from './sso-state.js';

const state: SsoBrowserState = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  nonce: 'sso-destination-nonce',
  cpi: 'argus_cpi_test_Example12345.fastpass',
  proofRequired: false,
  freshProofRequired: false,
  challengeUrl: '/sso/challenge/11111111-1111-4111-8111-111111111111',
  failureReturnUrl: '/merchant?status=failed',
};

const failed: SsoValidateResponse = {
  verdict: 'failed',
  reason: 'integrity_rejected',
  reasons: ['automation'],
  merchantSessionId: 'merchant-session',
  cpi: state.cpi,
};

describe('internal SSO destination', () => {
  it('carries a failed verdict back without attempting approval redemption', () => {
    const destination = new URL(validationDestination(state, failed), 'https://challenge.test');

    expect(destination.pathname).toBe('/merchant');
    expect(destination.searchParams.get('complete')).toBe('1');
    expect(destination.searchParams.get('status')).toBe('failed');
  });
});
