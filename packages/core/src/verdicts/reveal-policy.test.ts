import { describe, expect, it } from 'vitest';
import { REVEAL_CAP_SECONDS, shouldReleaseVerdict } from './reveal-policy.js';

describe('verdict reveal policy', () => {
  it.each([
    [null, 100, true],
    [{ challenge: false, phoneDone: false }, 100, true],
    [{ challenge: true, phoneDone: true }, 100, true],
    [{ challenge: true, phoneDone: false }, 100 + REVEAL_CAP_SECONDS - 1, false],
    [{ challenge: true, phoneDone: false }, 100 + REVEAL_CAP_SECONDS, true],
  ] as const)('maps state %# at time %s', (state, now, expected) => {
    expect(shouldReleaseVerdict(state, 100, now)).toBe(expected);
  });
});
