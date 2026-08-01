import { describe, expect, it } from 'vitest';

import { evaluateAuditReport } from '../../scripts/audit-policy.mjs';

const RSC_ADVISORY_URL = 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2';
const BEFORE_EXPIRY = new Date('2026-09-01T00:00:00.000Z');

const rscAdvisory = {
  source: 1_112_222,
  name: 'react-router',
  dependency: 'react-router',
  title: 'React Router RSC advisory',
  url: RSC_ADVISORY_URL,
  severity: 'high',
  range: '>=7.12.0 <8.3.0',
} as const;

describe('dependency audit policy', () => {
  it('blocks malformed reports instead of treating them as clean', () => {
    const result = evaluateAuditReport({ metadata: {} }, BEFORE_EXPIRY);

    expect(result.accepted).toEqual([]);
    expect(result.blocked.map(({ packageName }) => packageName)).toEqual(['audit-report']);
  });

  it('accepts a clean audit report', () => {
    const result = evaluateAuditReport({ vulnerabilities: {} }, BEFORE_EXPIRY);

    expect(result).toEqual({ accepted: [], blocked: [] });
  });

  it('accepts only the unreachable React Router RSC advisory before expiry', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          'react-router': {
            name: 'react-router',
            severity: 'high',
            via: [rscAdvisory],
          },
          'react-router-dom': {
            name: 'react-router-dom',
            severity: 'high',
            via: ['react-router'],
          },
        },
      },
      BEFORE_EXPIRY
    );

    expect(result.blocked).toEqual([]);
    expect(result.accepted.map(({ packageName }) => packageName)).toEqual([
      'react-router',
      'react-router-dom',
    ]);
  });

  it('blocks every other moderate-or-higher advisory', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          dependency: {
            name: 'dependency',
            severity: 'moderate',
            via: [
              {
                ...rscAdvisory,
                name: 'dependency',
                dependency: 'dependency',
                url: 'https://github.com/advisories/GHSA-not-allowed',
              },
            ],
          },
        },
      },
      BEFORE_EXPIRY
    );

    expect(result.accepted).toEqual([]);
    expect(result.blocked.map(({ packageName }) => packageName)).toEqual(['dependency']);
  });

  it('blocks the RSC advisory after the exception expires', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          'react-router': {
            name: 'react-router',
            severity: 'high',
            via: [rscAdvisory],
          },
        },
      },
      new Date('2026-10-01T00:00:00.000Z')
    );

    expect(result.accepted).toEqual([]);
    expect(result.blocked.map(({ packageName }) => packageName)).toEqual(['react-router']);
  });

  it('blocks a package when an accepted advisory is mixed with another finding', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          'react-router': {
            name: 'react-router',
            severity: 'high',
            via: [
              rscAdvisory,
              {
                ...rscAdvisory,
                source: 2_223_333,
                url: 'https://github.com/advisories/GHSA-another-finding',
              },
            ],
          },
        },
      },
      BEFORE_EXPIRY
    );

    expect(result.accepted).toEqual([]);
    expect(result.blocked).toHaveLength(1);
  });
});
