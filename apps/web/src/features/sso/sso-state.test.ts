import { describe, expect, it } from 'vitest';
import { readSsoStateValue, type SsoBrowserState } from './sso-state.js';

const state: SsoBrowserState = {
  sessionId: 'session-id',
  nonce: 'nonce-value-123456',
  cpi: 'argus_cpi_test_abcdefghijkl.stepup',
  proofRequired: true,
  freshProofRequired: false,
  challengeUrl: '/sso/challenge/session-id',
  failureReturnUrl: 'https://games.example/callback?status=failed',
};

describe('SSO browser state', () => {
  it('accepts complete state tied to its storage key', () => {
    expect(readSsoStateValue(JSON.stringify(state), 'session-id')).toEqual(state);
  });

  it('rejects cross-session and partial state', () => {
    expect(readSsoStateValue(JSON.stringify(state), 'other-session')).toBeNull();
    expect(readSsoStateValue('{"sessionId":"session-id"}', 'session-id')).toBeNull();
  });
});
