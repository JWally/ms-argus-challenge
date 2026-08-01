export const CHALLENGE_HTTP_ROUTES = [
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
  'POST /api/session/{id}/drawing-pictures',
  'GET /api/session/{id}/result',
  'ANY /api/{proxy+}',
] as const;

export type ChallengeHttpRoute = (typeof CHALLENGE_HTTP_ROUTES)[number];

export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const MERCHANT_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
