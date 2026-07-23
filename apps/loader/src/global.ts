import type { CaptchaResult } from '@argus-challenge/contracts/browser/captcha-message';

export interface CaptchaRenderOptions {
  cpi?: string;
  challengeId?: string;
  embedOrigin?: string;
  onResult?: (result: CaptchaResult) => void;
  onEvent?: (event: Record<string, unknown>) => void;
}

export interface MobileSsoOptions {
  cpi?: string;
  challengeId?: string;
  returnUrl: string;
}

export interface CaptchaHandle {
  destroy(): void;
}

export interface ArgusCaptchaGlobal {
  render(element: Element, options?: CaptchaRenderOptions): CaptchaHandle | null;
  startMobileSso(options: MobileSsoOptions): void;
  _auto(): void;
  embedOrigin: string;
}

declare global {
  interface Window {
    argusCaptcha?: ArgusCaptchaGlobal;
  }
}
