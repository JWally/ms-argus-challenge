const CLOSE_CHECK_DELAY_MS = 100;
const HISTORY_FALLBACK_DELAY_MS = 400;
const BLANK_PAGE = 'about:blank';

export interface PhonePageBrowser {
  closed: boolean;
  close(): void;
  history: {
    readonly length: number;
    back(): void;
  };
  location: {
    replace(url: string): void;
  };
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
}

export function dismissCompletedPhonePage(browser: PhonePageBrowser): () => void {
  let historyFallback: number | null = null;
  browser.close();
  const closeFallback = browser.setTimeout(() => {
    if (browser.closed) return;
    if (browser.history.length <= 1) {
      browser.location.replace(BLANK_PAGE);
      return;
    }
    browser.history.back();
    historyFallback = browser.setTimeout(() => {
      if (!browser.closed) browser.location.replace(BLANK_PAGE);
    }, HISTORY_FALLBACK_DELAY_MS);
  }, CLOSE_CHECK_DELAY_MS);

  return () => {
    browser.clearTimeout(closeFallback);
    if (historyFallback !== null) browser.clearTimeout(historyFallback);
  };
}
