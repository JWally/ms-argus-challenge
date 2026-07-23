import { describe, expect, it } from 'vitest';
import { readDesktopReady } from './phone-session.js';

describe('desktop-ready binding', () => {
  const message = {
    action: 'message' as const,
    from: 'desktop' as const,
    fromEnvelope: 'desktop-envelope',
    sessionId: 'session-id',
    data: {
      kind: 'desktop-ready',
      nonce: 'nonce-value-123456',
      expiresAt: 2_000_000_000,
      desktopArgusSessionId: 'argus-desktop',
      desktopKeyId: 'desktop-key',
    },
  };

  it('accepts a ready message bound to this session, envelope, and nonce', () => {
    expect(
      readDesktopReady(message, {
        sessionId: 'session-id',
        desktopEnvelope: 'desktop-envelope',
        nonce: 'nonce-value-123456',
      })
    ).toMatchObject({ desktopKeyId: 'desktop-key' });
  });

  it('rejects a replay from a different desktop envelope', () => {
    expect(
      readDesktopReady(message, {
        sessionId: 'session-id',
        desktopEnvelope: 'attacker-envelope',
        nonce: 'nonce-value-123456',
      })
    ).toBeNull();
  });
});
