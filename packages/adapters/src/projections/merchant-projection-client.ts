import { MerchantProjectionSchema, type MerchantProjection } from '@argus-challenge/contracts';

export type ProjectionFailureReason =
  | 'config_missing'
  | 'credential_malformed'
  | 'unauthorized'
  | 'insufficient_credits'
  | 'not_found'
  | 'conflict'
  | 'upstream_error'
  | 'http_error'
  | 'invalid_json'
  | 'invalid_projection'
  | 'network_error';

export type ProjectionFetchResult =
  | { ok: true; projection: MerchantProjection }
  | { ok: false; reason: ProjectionFailureReason; status?: number };

export interface MerchantProjectionClientConfig {
  apiUrl: string;
  credential: string;
  cpi: string;
  fetch: typeof fetch;
  warn(message: string): void;
}

export function splitMerchantCredential(credential: string): {
  keyId: string;
  token: string;
} {
  const separator = credential.indexOf('.');
  if (separator <= 0 || separator === credential.length - 1) {
    throw new Error('credential malformed: expected non-empty keyId.token');
  }
  return { keyId: credential.slice(0, separator), token: credential.slice(separator + 1) };
}

function failureReason(status: number): ProjectionFailureReason {
  if (status === 401) return 'unauthorized';
  if (status === 402) return 'insufficient_credits';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  return status >= 500 ? 'upstream_error' : 'http_error';
}

async function failedResponse(
  response: Response,
  argusSessionId: string,
  warn: MerchantProjectionClientConfig['warn']
): Promise<ProjectionFetchResult> {
  const body = await response.text().catch(() => '');
  warn(
    `[challenge] projection HTTP ${response.status} session=${argusSessionId} ` +
      `body=${body.slice(0, 200)}`
  );
  return { ok: false, reason: failureReason(response.status), status: response.status };
}

async function readProjection(
  response: Response,
  argusSessionId: string,
  warn: MerchantProjectionClientConfig['warn']
): Promise<ProjectionFetchResult> {
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    warn(`[challenge] projection invalid JSON session=${argusSessionId}`);
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = MerchantProjectionSchema.safeParse(value);
  if (!parsed.success) {
    warn(`[challenge] projection contract invalid session=${argusSessionId}`);
    return { ok: false, reason: 'invalid_projection' };
  }
  return { ok: true, projection: parsed.data };
}

export function createMerchantProjectionClient(config: MerchantProjectionClientConfig) {
  return {
    async fetchProjection(argusSessionId: string): Promise<ProjectionFetchResult> {
      if (!config.apiUrl || !config.credential || !config.cpi) {
        config.warn('[challenge] merchant projection configuration missing');
        return { ok: false, reason: 'config_missing' };
      }
      let credential: ReturnType<typeof splitMerchantCredential>;
      try {
        credential = splitMerchantCredential(config.credential);
      } catch {
        config.warn('[challenge] merchant projection credential malformed');
        return { ok: false, reason: 'credential_malformed' };
      }
      const url =
        `${config.apiUrl}/v1/session/${encodeURIComponent(config.cpi)}/` +
        encodeURIComponent(argusSessionId);
      try {
        const response = await config.fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': credential.keyId,
            'x-argus-token': credential.token,
          },
        });
        return response.ok
          ? readProjection(response, argusSessionId, config.warn)
          : failedResponse(response, argusSessionId, config.warn);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        config.warn(`[challenge] projection network error: ${message}`);
        return { ok: false, reason: 'network_error' };
      }
    },
  };
}
