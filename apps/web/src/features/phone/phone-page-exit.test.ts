import { describe, expect, it, vi } from 'vitest';
import { dismissCompletedPhonePage, type PhonePageBrowser } from './phone-page-exit.js';

function fakeBrowser(options: { canClose: boolean; historyLength: number }) {
  const timers: Array<() => void> = [];
  const back = vi.fn();
  const replace = vi.fn();
  const browser: PhonePageBrowser = {
    closed: false,
    close() {
      if (options.canClose) browser.closed = true;
    },
    history: { length: options.historyLength, back },
    location: { replace },
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: vi.fn(),
  };
  return {
    browser,
    back,
    replace,
    flushNext: () => timers.shift()?.(),
  };
}

describe('completed phone-page dismissal', () => {
  it('leaves a browser-closed page closed without navigating elsewhere', () => {
    const fake = fakeBrowser({ canClose: true, historyLength: 2 });

    dismissCompletedPhonePage(fake.browser);
    fake.flushNext();

    expect(fake.browser.closed).toBe(true);
    expect(fake.back).not.toHaveBeenCalled();
    expect(fake.replace).not.toHaveBeenCalled();
  });

  it('returns to browser history and blanks the page if close is blocked', () => {
    const fake = fakeBrowser({ canClose: false, historyLength: 2 });

    dismissCompletedPhonePage(fake.browser);
    fake.flushNext();
    expect(fake.back).toHaveBeenCalledOnce();
    fake.flushNext();

    expect(fake.replace).toHaveBeenCalledWith('about:blank');
  });

  it('blanks a standalone QR tab when close is blocked and it has no history', () => {
    const fake = fakeBrowser({ canClose: false, historyLength: 1 });

    dismissCompletedPhonePage(fake.browser);
    fake.flushNext();

    expect(fake.back).not.toHaveBeenCalled();
    expect(fake.replace).toHaveBeenCalledWith('about:blank');
  });
});
