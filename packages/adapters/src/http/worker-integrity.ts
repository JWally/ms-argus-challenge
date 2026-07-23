import { createHash } from 'node:crypto';

type WorkerIntegrityResult =
  | { ok: true }
  | {
      ok: false;
      status: 400;
      error: 'worker_integrity_invalid';
      reason: string;
    };

function failure(reason: string): WorkerIntegrityResult {
  return { ok: false, status: 400, error: 'worker_integrity_invalid', reason };
}

export function createWorkerIntegrityVerifier(config: {
  allowedOrigins: string[];
  fetch: typeof fetch;
}) {
  const cache = new Map<string, string>();
  return async (input: {
    workerUrl: unknown;
    workerSha256: unknown;
  }): Promise<WorkerIntegrityResult> => {
    if (typeof input.workerUrl !== 'string' || typeof input.workerSha256 !== 'string') {
      return failure('missing');
    }
    let url: URL;
    try {
      url = new URL(input.workerUrl);
    } catch {
      return failure('bad_url');
    }
    if (url.protocol !== 'https:' || !config.allowedOrigins.includes(url.origin)) {
      return failure('bad_origin');
    }
    if (!/^sha256-[A-Za-z0-9_-]{43}$/.test(input.workerSha256)) {
      return failure('bad_hash');
    }
    let expected = cache.get(url.href);
    if (!expected) {
      try {
        const response = await config.fetch(url.href, { method: 'GET' });
        if (!response.ok) return failure(`fetch_${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        expected = `sha256-${createHash('sha256').update(bytes).digest('base64url')}`;
        cache.set(url.href, expected);
      } catch {
        return failure('fetch_failed');
      }
    }
    return expected === input.workerSha256 ? { ok: true } : failure('hash_mismatch');
  };
}
