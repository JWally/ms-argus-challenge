import { describe, expect, it, vi } from 'vitest';
import { dispatchHttpEvent, type HttpApplication } from './handler.js';

describe('HTTP Lambda dispatch', () => {
  it('short-circuits heater events before API transport parsing', async () => {
    const application: HttpApplication = {
      route: vi.fn(),
      warm: vi.fn().mockResolvedValue({ warmed: true, rendererPrimed: true }),
    };

    await expect(
      dispatchHttpEvent(application, { source: 'argus.challenge.warmup' })
    ).resolves.toEqual({
      warmed: true,
      rendererPrimed: true,
    });
    expect(application.warm).toHaveBeenCalledOnce();
    expect(application.route).not.toHaveBeenCalled();
  });
});
