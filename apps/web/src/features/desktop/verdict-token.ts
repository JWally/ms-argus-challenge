function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireVerdictToken(response: unknown): string {
  if (!isRecord(response) || typeof response.token !== 'string' || response.token.length === 0) {
    throw new Error('verdict_token_missing');
  }
  return response.token;
}
