export interface SsoBrowserState {
  sessionId: string;
  nonce: string;
  cpi: string;
  proofRequired: boolean;
  freshProofRequired: boolean;
  challengeUrl: string;
  failureReturnUrl: string;
}

function storageKey(sessionId: string): string {
  return `argus-challenge:sso:${sessionId}`;
}

export function readSsoStateValue(raw: string | null, sessionId: string): SsoBrowserState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SsoBrowserState>;
    return value.sessionId === sessionId &&
      typeof value.nonce === 'string' &&
      typeof value.cpi === 'string' &&
      typeof value.proofRequired === 'boolean' &&
      typeof value.freshProofRequired === 'boolean' &&
      typeof value.challengeUrl === 'string' &&
      typeof value.failureReturnUrl === 'string'
      ? (value as SsoBrowserState)
      : null;
  } catch {
    return null;
  }
}

export function saveSsoState(state: SsoBrowserState): void {
  sessionStorage.setItem(storageKey(state.sessionId), JSON.stringify(state));
}

export function loadSsoState(sessionId: string): SsoBrowserState | null {
  return readSsoStateValue(sessionStorage.getItem(storageKey(sessionId)), sessionId);
}
