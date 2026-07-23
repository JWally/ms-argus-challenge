import type { ApplicationResponse } from '../http/application-response.js';
import { signVerdict } from '../tokens/verdict-token.js';

interface TokenEvent {
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
}

interface TokenSession {
  cpi?: string | null;
  challengeId?: string;
  verdict: 'pending' | 'paired' | 'failed';
  verdictReason?: string;
  phoneAttestation?: { receivedAt: number };
}

export interface VerdictTokenRouteDependencies {
  loadSession(sessionId: string): Promise<TokenSession | null>;
  verifyParticipant(token: string): Promise<{ sessionId: string } | null>;
  isReleased(sessionId: string, decidedAt: number, now: number): Promise<boolean>;
  getSecret(): Promise<string | null>;
  nowEpochSeconds(): number;
}

type Response = ApplicationResponse<Record<string, unknown>>;

function participantToken(event: TokenEvent): string {
  const authorization = event.headers?.authorization ?? event.headers?.Authorization ?? '';
  return event.queryStringParameters?.t ?? authorization.replace(/^Bearer\s+/i, '');
}

export function createVerdictTokenHandler(dependencies: VerdictTokenRouteDependencies) {
  return async (event: TokenEvent, sessionId: string): Promise<Response> => {
    const token = participantToken(event);
    const participant = token ? await dependencies.verifyParticipant(token) : null;
    if (participant?.sessionId !== sessionId) {
      return { status: 401, body: { error: 'verdict_token_unauthorized' } };
    }
    const session = await dependencies.loadSession(sessionId);
    if (!session) return { status: 404, body: { error: 'session_not_found' } };
    if (session.verdict === 'pending') {
      return { status: 409, body: { error: 'verdict_pending' } };
    }
    const now = dependencies.nowEpochSeconds();
    const decidedAt = session.phoneAttestation?.receivedAt ?? now;
    if (!(await dependencies.isReleased(sessionId, decidedAt, now))) {
      return { status: 409, body: { error: 'verdict_pending' } };
    }
    if (!session.challengeId) {
      return { status: 409, body: { error: 'challenge_binding_missing' } };
    }
    const secret = await dependencies.getSecret();
    if (!secret) {
      return { status: 503, body: { error: 'verdict_signing_unconfigured' } };
    }
    return {
      status: 200,
      body: {
        token: signVerdict(
          secret,
          {
            cpi: session.cpi ?? null,
            challengeId: session.challengeId,
            sessionId,
            verdict: session.verdict,
            reason: session.verdictReason ?? null,
          },
          now * 1000
        ),
      },
    };
  };
}
