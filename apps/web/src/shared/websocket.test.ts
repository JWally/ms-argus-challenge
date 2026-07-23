import { describe, expect, it } from 'vitest';
import { isPeerMessage, parseSocketJson } from './websocket.js';

describe('WebSocket message validation', () => {
  it('accepts a complete authenticated relay message shape', () => {
    const message = parseSocketJson(
      JSON.stringify({ action: 'message', from: 'phone', sessionId: 'session', data: {} })
    );
    expect(isPeerMessage(message)).toBe(true);
  });

  it.each([
    'not-json',
    JSON.stringify({ action: 'message', from: 'attacker', sessionId: 'session' }),
    JSON.stringify({ action: 'message', from: 'phone' }),
  ])('rejects malformed input', (raw) => {
    expect(isPeerMessage(parseSocketJson(raw))).toBe(false);
  });
});
