import { describe, expect, it, vi } from 'vitest';
import { HttpError, requestJson, userFacingError } from './http.js';

describe('requestJson', () => {
  it('sets JSON headers and returns a decoded response', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    await expect(requestJson('/api/test', { method: 'POST' }, 100, fetcher)).resolves.toEqual({
      ok: true,
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('preserves a structured server error without exposing raw JSON', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: 'phone_profile_required' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
    );
    const failed = requestJson('/api/test', {}, 100, fetcher);
    await expect(failed).rejects.toMatchObject({
      status: 403,
      code: 'phone_profile_required',
    });
    await expect(failed).rejects.not.toThrow(/\{"error"/);
  });
});

describe('userFacingError', () => {
  it('maps known failures to recoverable copy', () => {
    expect(userFacingError(new HttpError(429, 'rate_limited', {}))).toContain('Too many');
  });

  it('does not stringify unknown response bodies', () => {
    expect(userFacingError(new HttpError(500, 'internal_error', { secret: 'value' }))).toBe(
      'The challenge service had a problem. Please try again.'
    );
  });
});
