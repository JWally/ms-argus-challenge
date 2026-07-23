export interface VerdictClaims {
  cpi: string | null;
  challengeId: string;
  sessionId: string;
  verdict: string;
  reason: string | null;
  iat: number;
  exp: number;
}
