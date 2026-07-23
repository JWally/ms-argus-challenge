import {
  parseCaptchaMessage,
  type CaptchaResult,
} from '@argus-challenge/contracts/browser/captcha-message';
import type {
  ArgusCaptchaGlobal,
  CaptchaHandle,
  CaptchaRenderOptions,
  MobileSsoOptions,
} from './global.js';

declare const __EMBED_ORIGIN__: string;

const DEFAULT_WIDGET_MAX_WIDTH = '28rem';
const DEFAULT_WIDGET_HEIGHT = 420;
const MIN_WIDGET_HEIGHT = 260;
const MAX_WIDGET_HEIGHT = 640;

function callbackFrom(
  callbackName: string,
  callback: CaptchaRenderOptions['onResult']
): ((result: CaptchaResult) => void) | null {
  if (typeof callback === 'function') return callback;
  const candidate = callbackName
    ? (window as unknown as Record<string, unknown>)[callbackName]
    : null;
  return typeof candidate === 'function' ? (candidate as (result: CaptchaResult) => void) : null;
}

function scriptOrigin(script: HTMLScriptElement): string {
  try {
    return new URL(script.src, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function defaultEmbedOrigin(script: HTMLScriptElement): string {
  return (
    script.getAttribute('data-embed-origin') ||
    (__EMBED_ORIGIN__ === '__SCRIPT_ORIGIN__' ? scriptOrigin(script) : __EMBED_ORIGIN__)
  );
}

function iframeUrl(origin: string, cpi: string, challengeId: string, hostOrigin: string): string {
  const url = new URL('/embed', origin);
  url.search = new URLSearchParams({ cpi, challengeId, origin: hostOrigin }).toString();
  return url.toString();
}

function mountCaptcha(
  element: Element,
  options: CaptchaRenderOptions,
  defaults: { cpi: string; challengeId: string; callbackName: string; embedOrigin: string }
): CaptchaHandle | null {
  const slot = element as Element & { __argusMounted?: boolean };
  if (slot.__argusMounted) return null;
  slot.__argusMounted = true;
  const origin = options.embedOrigin || defaults.embedOrigin;
  const callback = callbackFrom(defaults.callbackName, options.onResult);
  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl(
    origin,
    options.cpi || defaults.cpi,
    options.challengeId || defaults.challengeId,
    window.location.origin
  );
  iframe.title = 'Argus device pairing';
  iframe.setAttribute('referrerpolicy', 'origin');
  iframe.style.cssText =
    `border:0;display:block;width:100%;max-width:${DEFAULT_WIDGET_MAX_WIDTH};` +
    `height:${DEFAULT_WIDGET_HEIGHT}px;color-scheme:normal;background:transparent;`;
  slot.appendChild(iframe);

  const sendViewport = (): void => {
    iframe.contentWindow?.postMessage(
      { source: 'argus-captcha-host', event: 'viewport', width: window.innerWidth },
      origin
    );
  };
  const receiveMessage = (event: MessageEvent): void => {
    const message = parseCaptchaMessage(event, origin, iframe.contentWindow);
    if (!message) return;
    if (message.sizeHeight !== null) {
      const height = Math.min(
        MAX_WIDGET_HEIGHT,
        Math.max(MIN_WIDGET_HEIGHT, Math.ceil(message.sizeHeight))
      );
      iframe.style.height = `${height}px`;
      return;
    }
    options.onEvent?.(message.payload);
    if (message.result) callback?.(message.result);
  };
  iframe.addEventListener('load', sendViewport);
  window.addEventListener('resize', sendViewport);
  window.addEventListener('message', receiveMessage);

  return {
    destroy(): void {
      window.removeEventListener('message', receiveMessage);
      window.removeEventListener('resize', sendViewport);
      iframe.remove();
      slot.__argusMounted = false;
    },
  };
}

function install(script: HTMLScriptElement): ArgusCaptchaGlobal {
  const defaults = {
    cpi: script.getAttribute('data-cpi') || '',
    challengeId: script.getAttribute('data-challenge-id') || '',
    callbackName: script.getAttribute('data-onresult') || '',
    embedOrigin: defaultEmbedOrigin(script),
  };
  const render = (element: Element, options: CaptchaRenderOptions = {}) =>
    mountCaptcha(element, options, defaults);
  const startMobileSso = (options: MobileSsoOptions): void => {
    const cpi = options.cpi || defaults.cpi;
    const challengeId = options.challengeId || defaults.challengeId;
    if (!cpi || !challengeId || !options.returnUrl) {
      throw new Error('cpi, challengeId, and returnUrl are required');
    }
    const launch = new URL('/sso/mobile', defaults.embedOrigin);
    launch.search = new URLSearchParams({
      cpi,
      challengeId,
      returnUrl: options.returnUrl,
    }).toString();
    window.location.assign(launch.toString());
  };
  const auto = (): void => {
    document.querySelectorAll('.argus-captcha').forEach((element) => render(element));
  };
  return { render, startMobileSso, _auto: auto, embedOrigin: defaults.embedOrigin };
}

const currentScript = document.currentScript as HTMLScriptElement | null;
if (currentScript) {
  const api = install(currentScript);
  window.argusCaptcha = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', api._auto);
  } else {
    api._auto();
  }
}
