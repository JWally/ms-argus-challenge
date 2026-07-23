import type { ApplicationResponse } from '../http/application-response.js';

type ResultSession = {
  verdict: 'pending' | 'paired' | 'failed';
  verdictReason?: string;
  annotations?: Record<string, unknown>;
  phoneAttestation?: { receivedAt: number };
};

type SealedResultInput = {
  sessionId: string;
  verdict: 'paired' | 'failed';
  reason: string | null;
  annotations: Record<string, unknown>;
  nextDeviceTrust: null;
  decidedAt: number;
  now: number;
};

export interface SessionResultDependencies {
  authenticateParticipant(event: unknown, sessionId: string): Promise<boolean>;
  loadSession(sessionId: string): Promise<ResultSession | null>;
  sealResult(input: SealedResultInput): Promise<Record<string, unknown>>;
  nowEpochSeconds(): number;
}

type ResultResponse = ApplicationResponse<Record<string, unknown> | null>;

export function createSessionResultHandler(dependencies: SessionResultDependencies) {
  return async (event: unknown, sessionId: string): Promise<ResultResponse> => {
    if (!(await dependencies.authenticateParticipant(event, sessionId))) {
      return { status: 401, body: { error: 'result_unauthorized' } };
    }
    const session = await dependencies.loadSession(sessionId);
    if (!session) return { status: 410, body: { error: 'session_expired' } };
    if (session.verdict === 'pending') return { status: 204, body: null };
    const now = dependencies.nowEpochSeconds();
    return {
      status: 200,
      body: await dependencies.sealResult({
        sessionId,
        verdict: session.verdict,
        reason: session.verdictReason ?? null,
        annotations: session.annotations ?? {},
        nextDeviceTrust: null,
        decidedAt: session.phoneAttestation?.receivedAt ?? now,
        now,
      }),
    };
  };
}
