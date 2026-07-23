import { describe, expect, it } from 'vitest';
import { baseIntegrityCpi, requireAttestedScan } from './argus.js';

describe('baseIntegrityCpi', () => {
  it.each(['fastpass', 'stepup', 'forceauth'])('removes the %s policy suffix', (scope) => {
    expect(baseIntegrityCpi(`argus_cpi_test_abcdefghijkl.${scope}`)).toBe(
      'argus_cpi_test_abcdefghijkl'
    );
  });
});

describe('requireAttestedScan', () => {
  it('fails closed when the SDK returns no signed attestation', () => {
    expect(() =>
      requireAttestedScan({
        sessionId: null,
        argusSessionId: 'argus-1',
        durationMs: 1,
        attestError: 'signing unavailable',
      })
    ).toThrow('argus_attestation_failed');
  });
});
