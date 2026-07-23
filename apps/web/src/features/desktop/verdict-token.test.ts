import { describe, expect, it } from 'vitest';
import { requireVerdictToken } from './verdict-token.js';

describe('desktop verdict token response', () => {
  it('accepts a non-empty server token', () => {
    expect(requireVerdictToken({ token: 'signed-token' })).toBe('signed-token');
  });

  it.each([null, {}, { token: null }, { token: '' }, { token: 42 }])(
    'fails closed for malformed response %#',
    (response) => {
      expect(() => requireVerdictToken(response)).toThrow('verdict_token_missing');
    }
  );
});
