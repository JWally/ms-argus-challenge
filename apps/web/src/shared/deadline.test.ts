import { describe, expect, it, vi } from 'vitest';
import { withDeadline } from './deadline.js';

describe('withDeadline', () => {
  it('returns a value that settles before the deadline', async () => {
    await expect(withDeadline(Promise.resolve('ready'), 50, 'scan')).resolves.toBe('ready');
  });

  it('rejects with a stable operation-specific timeout', async () => {
    vi.useFakeTimers();
    const pending = withDeadline(new Promise<never>(() => undefined), 50, 'scan');
    const rejection = expect(pending).rejects.toThrow('scan_timeout');
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    vi.useRealTimers();
  });
});
