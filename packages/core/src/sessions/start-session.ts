import { MERCHANT_CHALLENGE_PATTERN } from '@argus-challenge/contracts';
import { parseScopedCpi, requiresProofOfLife } from '../assurance/scoped-cpi.js';
import type { ApplicationResponse } from '../http/application-response.js';
import type { ChallengeSession, ParticipantRole, SessionRepository } from './session.js';

interface StartRateLimiter {
  allow(viewerIp: string): Promise<boolean>;
}

interface BootstrapTokenIssuer {
  mint(sessionId: string, role: ParticipantRole): Promise<string>;
}

interface Identifiers {
  sessionId(): string;
  nonce(): string;
}

interface Clock {
  nowEpochSeconds(): number;
}

interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface StartSessionDependencies {
  rateLimiter: StartRateLimiter;
  sessions: Pick<SessionRepository, 'create'>;
  bootstrapTokens: BootstrapTokenIssuer;
  ids: Identifiers;
  clock: Clock;
  logger: Logger;
  sessionTtlSeconds: number;
  proofRequiredByDefault: boolean;
  webSocketUrl: string | null;
}

type StartBody = Record<string, unknown>;
type StartResponse = ApplicationResponse<Record<string, unknown>>;
type StartFailure = { response: StartResponse };

interface ValidatedStart {
  challengeId: string;
  scopedCpi: ReturnType<typeof parseScopedCpi>;
  hostPreflightRequired: boolean;
  hostOrigin?: string;
}

function validMerchantOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const isLocalHttp =
      parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    return parsed.origin === origin && (parsed.protocol === 'https:' || isLocalHttp);
  } catch {
    return false;
  }
}

async function rateLimitDecision(
  viewerIp: string,
  dependencies: StartSessionDependencies
): Promise<'allowed' | 'limited' | 'unavailable'> {
  try {
    return (await dependencies.rateLimiter.allow(viewerIp)) ? 'allowed' : 'limited';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.logger.warn(
      `[challenge] session-start rate-limit check failed closed: ${message}`
    );
    return 'unavailable';
  }
}

function challengeId(body: StartBody): string | StartFailure {
  if (body.challengeId === undefined) {
    return { response: { status: 400, body: { error: 'missing_challenge_id' } } } as const;
  }
  if (typeof body.challengeId !== 'string' || !MERCHANT_CHALLENGE_PATTERN.test(body.challengeId)) {
    return { response: { status: 400, body: { error: 'invalid_challenge_id' } } } as const;
  }
  return body.challengeId;
}

function validateStart(body: StartBody): ValidatedStart | StartFailure {
  const challenge = challengeId(body);
  if (typeof challenge !== 'string') return challenge;
  const scopedCpi = parseScopedCpi(body.cpi);
  if (body.cpi !== undefined && !scopedCpi) {
    return { response: { status: 400, body: { error: 'invalid_cpi' } } } as const;
  }
  const hostPreflightRequired = body.hostPreflightRequired === true;
  if (hostPreflightRequired && !scopedCpi) {
    return {
      response: { status: 400, body: { error: 'host_preflight_requires_cpi' } },
    } as const;
  }
  const hostOrigin = typeof body.hostOrigin === 'string' ? body.hostOrigin : undefined;
  if (hostPreflightRequired && (!hostOrigin || !validMerchantOrigin(hostOrigin))) {
    return {
      response: { status: 400, body: { error: 'host_preflight_origin_invalid' } },
    } as const;
  }
  return {
    challengeId: challenge,
    scopedCpi,
    hostPreflightRequired,
    ...(hostOrigin ? { hostOrigin } : {}),
  };
}

function parseSession(body: StartBody, dependencies: StartSessionDependencies) {
  const validated = validateStart(body);
  if ('response' in validated) return validated;
  const now = dependencies.clock.nowEpochSeconds();
  const session: ChallengeSession = {
    id: dependencies.ids.sessionId(),
    nonce: dependencies.ids.nonce(),
    expiresAt: now + dependencies.sessionTtlSeconds,
    challengeId: validated.challengeId,
    cpi: validated.scopedCpi?.cpi ?? null,
    proofRequired: requiresProofOfLife(validated.scopedCpi, dependencies.proofRequiredByDefault),
    freshProofRequired: validated.scopedCpi?.freshProofRequired ?? false,
    hostPreflightRequired: validated.hostPreflightRequired,
    ...(validated.hostOrigin ? { hostOrigin: validated.hostOrigin } : {}),
    verdict: 'pending',
  };
  return { session } as const;
}

async function storeAndRespond(
  session: ChallengeSession,
  dependencies: StartSessionDependencies
): Promise<StartResponse> {
  const stored = await dependencies.sessions.create(session);
  if (!stored.ok) return { status: 409, body: { error: 'session_id_collision' } };
  const [desktopToken, phoneToken] = await Promise.all([
    dependencies.bootstrapTokens.mint(session.id, 'desktop'),
    dependencies.bootstrapTokens.mint(session.id, 'phone'),
  ]);
  return {
    status: 200,
    body: {
      sessionId: session.id,
      nonce: session.nonce,
      expiresAt: session.expiresAt,
      ws: { url: dependencies.webSocketUrl, desktopToken, phoneToken },
    },
  };
}

export async function startSession(
  body: StartBody,
  viewerIp: string,
  dependencies: StartSessionDependencies
): Promise<StartResponse> {
  const rateLimit = await rateLimitDecision(viewerIp, dependencies);
  if (rateLimit === 'unavailable') {
    return { status: 503, body: { error: 'rate_limit_unavailable' } };
  }
  if (rateLimit === 'limited') {
    return { status: 429, body: { error: 'rate_limited', scope: 'session_start' } };
  }
  const parsed = parseSession(body, dependencies);
  return 'response' in parsed ? parsed.response : storeAndRespond(parsed.session, dependencies);
}
