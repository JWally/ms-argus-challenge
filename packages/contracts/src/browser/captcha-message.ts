export interface CaptchaResult {
  sessionId: string;
  token: string;
}

export interface CaptchaMessageEnvelope {
  origin: string;
  source: unknown;
  data: unknown;
}

export interface ParsedCaptchaMessage {
  payload: Record<string, unknown>;
  result: CaptchaResult | null;
  sizeHeight: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseResult(payload: Record<string, unknown>): CaptchaResult | null {
  if (payload.event !== 'result') return null;
  if (typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) return null;
  if (typeof payload.token !== 'string' || payload.token.length === 0) return null;

  return {
    sessionId: payload.sessionId,
    token: payload.token,
  };
}

function parseSizeHeight(payload: Record<string, unknown>): number | null {
  if (payload.event !== 'size') return null;
  return typeof payload.height === 'number' && Number.isFinite(payload.height)
    ? payload.height
    : null;
}

export function parseCaptchaMessage(
  envelope: CaptchaMessageEnvelope,
  expectedOrigin: string,
  expectedSource: unknown
): ParsedCaptchaMessage | null {
  if (envelope.origin !== expectedOrigin || envelope.source !== expectedSource) return null;
  if (!isRecord(envelope.data) || envelope.data.source !== 'argus-captcha') return null;

  return {
    payload: envelope.data,
    result: parseResult(envelope.data),
    sizeHeight: parseSizeHeight(envelope.data),
  };
}
