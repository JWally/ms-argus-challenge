import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerIntegrityVerifier } from './worker-integrity.js';

const bytes = Buffer.from('trusted worker bytes');
const hash = `sha256-${createHash('sha256').update(bytes).digest('base64url')}`;

describe('worker integrity verifier', () => {
  it('fetches an allowed HTTPS worker once and compares its bytes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(bytes));
    const verify = createWorkerIntegrityVerifier({
      allowedOrigins: ['https://challenge.example'],
      fetch,
    });
    const input = { workerUrl: 'https://challenge.example/worker.js', workerSha256: hash };
    await expect(verify(input)).resolves.toEqual({ ok: true });
    await expect(verify(input)).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['http://challenge.example/worker.js', hash, 'bad_origin'],
    ['https://evil.example/worker.js', hash, 'bad_origin'],
    ['https://challenge.example/worker.js', 'sha256-nope', 'bad_hash'],
    ['not a url', hash, 'bad_url'],
  ])('rejects URL/hash input %s', async (workerUrl, workerSha256, reason) => {
    const verify = createWorkerIntegrityVerifier({
      allowedOrigins: ['https://challenge.example'],
      fetch,
    });
    await expect(verify({ workerUrl, workerSha256 })).resolves.toMatchObject({
      ok: false,
      reason,
    });
  });

  it('fails closed on changed bytes or unavailable workers', async () => {
    const mismatch = createWorkerIntegrityVerifier({
      allowedOrigins: ['https://challenge.example'],
      fetch: vi.fn().mockResolvedValue(new Response('changed')),
    });
    await expect(
      mismatch({ workerUrl: 'https://challenge.example/worker.js', workerSha256: hash })
    ).resolves.toMatchObject({ ok: false, reason: 'hash_mismatch' });
    const unavailable = createWorkerIntegrityVerifier({
      allowedOrigins: ['https://challenge.example'],
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    });
    await expect(
      unavailable({ workerUrl: 'https://challenge.example/worker.js', workerSha256: hash })
    ).resolves.toMatchObject({ ok: false, reason: 'fetch_503' });
  });
});
