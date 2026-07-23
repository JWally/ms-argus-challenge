import { describe, expect, it, vi } from 'vitest';
import { createQrRendererPrimer } from './renderer-primer.js';

describe('QR renderer primer', () => {
  it('shares concurrent work and skips refreshes inside the warm interval', async () => {
    let finishRender = (): void => undefined;
    const renderGate = new Promise<void>((resolve) => {
      finishRender = resolve;
    });
    const render = vi.fn(() => renderGate);
    const nowMilliseconds = vi.fn(() => 1_000);
    const prime = createQrRendererPrimer(render, { nowMilliseconds });

    const first = prime();
    const concurrent = prime();
    await Promise.resolve();
    expect(render).toHaveBeenCalledOnce();
    finishRender();

    await expect(first).resolves.toBe(true);
    await expect(concurrent).resolves.toBe(false);
    await expect(prime()).resolves.toBe(false);
    expect(render).toHaveBeenCalledOnce();
  });

  it('refreshes before the next ten-second heater pass', async () => {
    let now = 1_000;
    const render = vi.fn(async () => undefined);
    const prime = createQrRendererPrimer(render, {
      nowMilliseconds: () => now,
    });

    await expect(prime()).resolves.toBe(true);
    now += 4_999;
    await expect(prime()).resolves.toBe(false);
    now += 1;
    await expect(prime()).resolves.toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('allows a later warmup to retry a failed initialization', async () => {
    const render = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('encoder unavailable'))
      .mockResolvedValueOnce();
    const prime = createQrRendererPrimer(render);

    await expect(prime()).rejects.toThrow('encoder unavailable');
    await expect(prime()).resolves.toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
