import { withDeadline } from './deadline.js';

type Fetcher = typeof globalThis.fetch;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown>
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

function recordBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function decodeBody(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return {};
  return recordBody(await response.json().catch(() => ({})));
}

export async function requestJson<T = Record<string, unknown>>(
  input: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
  fetcher: Fetcher = globalThis.fetch
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await withDeadline(
    fetcher(input, { ...init, headers, credentials: 'same-origin' }),
    timeoutMs,
    'network'
  );
  const body = await decodeBody(response);
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : `http_${response.status}`;
    throw new HttpError(response.status, code, body);
  }
  return body as T;
}

const COPY: Readonly<Record<string, string>> = {
  rate_limited: 'Too many attempts. Wait a moment, then try again.',
  network_timeout: 'The connection took too long. Check your network and try again.',
  phone_profile_required: 'This device did not identify as a phone. Open the link on your phone.',
  session_expired: 'This challenge expired. Scan a new code to continue.',
  sso_session_not_found: 'This sign-in expired. Start again from the original site.',
  origin_not_allowed: 'This site is not authorized to use the challenge.',
};

export function userFacingError(error: unknown): string {
  const code =
    error instanceof HttpError ? error.code : error instanceof Error ? error.message : '';
  if (COPY[code]) return COPY[code];
  if (code.endsWith('_timeout')) return COPY.network_timeout ?? 'The connection timed out.';
  return 'The challenge service had a problem. Please try again.';
}
