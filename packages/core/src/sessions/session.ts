export type ParticipantRole = 'desktop' | 'phone';
export type SessionVerdict = 'pending' | 'paired' | 'failed';

export interface ChallengeSession {
  id: string;
  nonce: string;
  expiresAt: number;
  challengeId: string;
  cpi: string | null;
  proofRequired: boolean;
  freshProofRequired: boolean;
  hostPreflightRequired: boolean;
  hostOrigin?: string;
  verdict: SessionVerdict;
  verdictReason?: string;
  desktopAttestation?: unknown;
  phoneAttestation?: unknown;
  annotations?: Record<string, unknown>;
}

export interface SessionRepository {
  create(session: ChallengeSession): Promise<{ ok: true } | { ok: false; reason: 'collision' }>;
  load(sessionId: string): Promise<ChallengeSession | null>;
}
