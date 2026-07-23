import { describe, expect, it } from 'vitest';
import { parseScopedCpi, requiresProofOfLife } from './scoped-cpi.js';

const BASE_CPI = 'argus_cpi_live_AbC123xYz789';

describe('scoped CPI policy', () => {
  it.each([
    [BASE_CPI, 'integrity', false, false],
    [`${BASE_CPI}.fastpass`, 'fastpass', false, false],
    [`${BASE_CPI}.stepup`, 'stepup', true, false],
    [`${BASE_CPI}.forceauth`, 'forceauth', true, true],
  ] as const)('resolves %s', (cpi, scope, proofRequired, freshProofRequired) => {
    expect(parseScopedCpi(cpi)).toEqual({ cpi, scope, proofRequired, freshProofRequired });
  });

  it.each([undefined, null, '', `${BASE_CPI}.unknown`, 'argus_cpi_test_short'])(
    'rejects malformed CPI %s',
    (value) => expect(parseScopedCpi(value)).toBeNull()
  );

  it('keeps the operator strict-mode override', () => {
    expect(requiresProofOfLife(parseScopedCpi(BASE_CPI), true)).toBe(true);
    expect(requiresProofOfLife(parseScopedCpi(BASE_CPI), false)).toBe(false);
  });
});
