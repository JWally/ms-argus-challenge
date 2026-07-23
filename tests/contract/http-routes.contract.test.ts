import { describe, expect, it } from 'vitest';
import { CHALLENGE_HTTP_ROUTES } from '@argus-challenge/contracts';

const pairRoutes = [
  'POST /api/session/start',
  'POST /api/sso/start',
  'POST /api/sso/{id}/challenge',
  'POST /api/sso/{id}/validate',
  'POST /api/sso/approval/redeem',
  'POST /api/sso/approval/exchange',
  'GET /api/session/{id}/info',
  'GET /api/session/{id}/verdict-token',
  'POST /api/verify',
  'POST /api/session/{id}/pair-token',
  'POST /api/pair-token/redeem',
  'POST /api/phone-perf',
  'POST /api/sso/telemetry',
  'POST /api/session/{id}/desktop-attest',
  'POST /api/session/{id}/phone-attest',
  'GET /api/session/{id}/result',
  'ANY /api/{proxy+}',
] as const;

describe('latest Pair HTTP contract', () => {
  it('exposes exactly the current route keys without legacy versions', () => {
    expect(CHALLENGE_HTTP_ROUTES).toEqual(pairRoutes);
    expect(CHALLENGE_HTTP_ROUTES.some((route) => /\/v[12]\//.test(route))).toBe(false);
  });
});
