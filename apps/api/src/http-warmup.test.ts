import { describe, expect, it, vi } from 'vitest';
import { createHttpWarmup, isHttpWarmupEvent } from './http-warmup.js';

describe('HTTP warmup boundary', () => {
  it('recognizes only the explicit Challenge heater marker', () => {
    expect(isHttpWarmupEvent({ source: 'argus.challenge.warmup' })).toBe(true);
    expect(isHttpWarmupEvent({ source: 'serverless-plugin-warmup' })).toBe(false);
    expect(isHttpWarmupEvent({ requestContext: { routeKey: 'POST /api/session/start' } })).toBe(
      false
    );
  });

  it('warms persistence and the QR renderer in parallel', async () => {
    const order: string[] = [];
    const warmSessionStore = vi.fn(async () => {
      order.push('store');
    });
    const primeQrRenderer = vi.fn(async () => {
      order.push('renderer');
      return true;
    });
    const recordProfile = vi.fn();
    const warm = createHttpWarmup({
      warmSessionStore,
      primeQrRenderer,
      nowMilliseconds: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125),
      recordProfile,
    });

    await expect(warm()).resolves.toEqual({ warmed: true, rendererPrimed: true });
    expect(order).toEqual(['store', 'renderer']);
    expect(recordProfile).toHaveBeenCalledWith({
      event: 'challenge_http_warmup',
      durationMs: 25,
      rendererPrimed: true,
    });
  });
});
