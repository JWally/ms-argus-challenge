import { SESSION_ID_PATTERN } from '@argus-challenge/contracts';
import type { ApplicationResponse } from './application-response.js';

const MAX_BODY_CHARACTERS = 16 * 1024;

const ID_LESS_ROUTES = new Set([
  'POST /api/session/start',
  'POST /api/sso/start',
  'POST /api/sso/approval/redeem',
  'POST /api/sso/approval/exchange',
  'POST /api/verify',
  'POST /api/pair-token/redeem',
  'POST /api/phone-perf',
  'POST /api/sso/telemetry',
]);

type Body = Record<string, unknown>;
type MaybePromise<T> = T | Promise<T>;
type ApiResponse = ApplicationResponse<Record<string, unknown> | null>;

export interface ChallengeApiEvent {
  routeKey: string;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  requestContext?: {
    http?: { sourceIp?: string };
    identity?: { sourceIp?: string };
  };
}

export interface PublicChallengeSession {
  expiresAt: number;
  verdict: string;
  desktopAttestation?: unknown;
}

export interface ChallengeApiRouterDependencies {
  allowOrigin(event: ChallengeApiEvent): boolean;
  handleTelemetry(routeKey: string, body: Body, event: ChallengeApiEvent): ApiResponse | null;
  startSession(body: Body, viewerIp: string): MaybePromise<ApiResponse>;
  startSso(body: Body): MaybePromise<ApiResponse>;
  challengeSso(sessionId: string, body: Body): MaybePromise<ApiResponse>;
  validateSso(sessionId: string, body: Body, viewerIp: string): MaybePromise<ApiResponse>;
  redeemSsoApproval(body: Body, cookies?: string[]): MaybePromise<ApiResponse>;
  exchangeSsoApproval(body: Body): MaybePromise<ApiResponse>;
  loadSession(sessionId: string): Promise<PublicChallengeSession | null>;
  attestDesktop(body: Body, sessionId: string): MaybePromise<ApiResponse>;
  attestPhone(body: Body, sessionId: string, viewerIp: string): MaybePromise<ApiResponse>;
  getDrawingPictures(
    event: ChallengeApiEvent,
    sessionId: string,
    body: Body
  ): MaybePromise<ApiResponse>;
  getSessionResult(event: ChallengeApiEvent, sessionId: string): MaybePromise<ApiResponse>;
  mintPairToken(event: ChallengeApiEvent, sessionId: string, body: Body): MaybePromise<ApiResponse>;
  redeemPairToken(token: string): Promise<unknown>;
  mintVerdictToken(event: ChallengeApiEvent, sessionId: string): MaybePromise<ApiResponse>;
  verifyVerdict(body: Body): MaybePromise<ApiResponse>;
}

interface RouteContext {
  event: ChallengeApiEvent;
  body: Body;
  sessionId: string;
  viewerIp: string;
}

type RouteHandler = () => MaybePromise<ApiResponse>;

function parseBody(raw: string | undefined): Body | null {
  if (!raw) return {};
  if (raw.length > MAX_BODY_CHARACTERS) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Body)
      : null;
  } catch {
    return null;
  }
}

function viewerIp(event: ChallengeApiEvent): string {
  const rawAddress =
    event.headers?.['cloudfront-viewer-address'] ??
    event.headers?.['CloudFront-Viewer-Address'] ??
    '';
  if (rawAddress.startsWith('[')) {
    const closingBracket = rawAddress.indexOf(']');
    if (closingBracket > 0) return rawAddress.slice(1, closingBracket);
  }
  if (rawAddress) {
    const portSeparator = rawAddress.lastIndexOf(':');
    return portSeparator > 0 ? rawAddress.slice(0, portSeparator) : rawAddress;
  }
  return event.requestContext?.http?.sourceIp ?? event.requestContext?.identity?.sourceIp ?? '';
}

function publicSessionResponse(session: PublicChallengeSession | null): ApiResponse {
  if (!session) return { status: 200, body: { expired: true } };
  return {
    status: 200,
    body: {
      expiresAt: session.expiresAt,
      desktopReady: Boolean(session.desktopAttestation),
      verdict: session.verdict,
    },
  };
}

async function redeemShortToken(
  body: Body,
  redeem: ChallengeApiRouterDependencies['redeemPairToken']
): Promise<ApiResponse> {
  if (typeof body.token !== 'string') {
    return { status: 400, body: { error: 'missing_token' } };
  }
  const blob = await redeem(body.token);
  return blob
    ? { status: 200, body: blob as Record<string, unknown> }
    : { status: 410, body: { error: 'token_expired_or_used' } };
}

function routes(
  dependencies: ChallengeApiRouterDependencies,
  context: RouteContext
): Map<string, RouteHandler> {
  const { event, body, sessionId, viewerIp: sourceIp } = context;
  return new Map([
    ['POST /api/session/start', () => dependencies.startSession(body, sourceIp)],
    ['POST /api/sso/start', () => dependencies.startSso(body)],
    ['POST /api/sso/{id}/challenge', () => dependencies.challengeSso(sessionId, body)],
    ['POST /api/sso/{id}/validate', () => dependencies.validateSso(sessionId, body, sourceIp)],
    ['POST /api/sso/approval/redeem', () => dependencies.redeemSsoApproval(body, event.cookies)],
    ['POST /api/sso/approval/exchange', () => dependencies.exchangeSsoApproval(body)],
    [
      'GET /api/session/{id}/info',
      async () => publicSessionResponse(await dependencies.loadSession(sessionId)),
    ],
    ['POST /api/session/{id}/desktop-attest', () => dependencies.attestDesktop(body, sessionId)],
    [
      'POST /api/session/{id}/phone-attest',
      () => dependencies.attestPhone(body, sessionId, sourceIp),
    ],
    [
      'POST /api/session/{id}/drawing-pictures',
      () => dependencies.getDrawingPictures(event, sessionId, body),
    ],
    ['GET /api/session/{id}/result', () => dependencies.getSessionResult(event, sessionId)],
    ['POST /api/session/{id}/pair-token', () => dependencies.mintPairToken(event, sessionId, body)],
    ['POST /api/pair-token/redeem', () => redeemShortToken(body, dependencies.redeemPairToken)],
    ['GET /api/session/{id}/verdict-token', () => dependencies.mintVerdictToken(event, sessionId)],
    ['POST /api/verify', () => dependencies.verifyVerdict(body)],
  ]);
}

export function createChallengeApiRouter(dependencies: ChallengeApiRouterDependencies) {
  return async (event: ChallengeApiEvent): Promise<ApiResponse> => {
    if (!dependencies.allowOrigin(event)) {
      return { status: 403, body: { error: 'origin_not_allowed' } };
    }
    const sessionId = event.pathParameters?.id?.toLowerCase() ?? '';
    if (!ID_LESS_ROUTES.has(event.routeKey) && !SESSION_ID_PATTERN.test(sessionId)) {
      return { status: 400, body: { error: 'invalid_session_id' } };
    }
    const body = parseBody(event.body);
    if (!body) return { status: 400, body: { error: 'invalid_body' } };
    const telemetry = dependencies.handleTelemetry(event.routeKey, body, event);
    if (telemetry) return telemetry;
    const handler = routes(dependencies, {
      event,
      body,
      sessionId,
      viewerIp: viewerIp(event),
    }).get(event.routeKey);
    return handler
      ? handler()
      : { status: 200, body: { error: 'no_matching_route', routeKey: event.routeKey } };
  };
}
