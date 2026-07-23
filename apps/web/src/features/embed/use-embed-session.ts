import { useEffect, useState, type RefObject, type SetStateAction } from 'react';
import { startDesktopFlow } from '../desktop/desktop-flow.js';
import type { DesktopController } from '../desktop/desktop-types.js';
import type { RenderedQrFrames } from '../qr/qr-protocol.js';
import { userFacingError } from '../../shared/http.js';
import type { EmbedConfig } from './embed-config.js';

interface EmbedViewState {
  status: string;
  qr: RenderedQrFrames | null;
  completion: 'paired' | 'failed' | null;
  error: string | null;
}

function postToHost(hostOrigin: string | null, payload: Record<string, unknown>): void {
  if (!hostOrigin || window.parent === window) return;
  window.parent.postMessage({ source: 'argus-captcha', ...payload }, hostOrigin);
}

export function useHostSize(root: RefObject<HTMLElement | null>, hostOrigin: string | null): void {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      postToHost(hostOrigin, { event: 'size', height: element.scrollHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hostOrigin, root]);
}

export function useEmbedSession(config: EmbedConfig | null): EmbedViewState {
  const [view, setView] = useState<EmbedViewState>({
    status: 'Preparing challenge',
    qr: null,
    completion: null,
    error: null,
  });
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let controller: DesktopController | null = null;
    const events = {
      status: (status: string) => setView((current) => ({ ...current, status })),
      phoneConnected() {
        setView((current) => ({ ...current, status: 'Phone connected' }));
        postToHost(config.hostOrigin, { event: 'connected' });
      },
      error: (cause: unknown) =>
        setView((current) => ({ ...current, error: userFacingError(cause) })),
    };
    void runEmbedSession(
      config,
      events,
      (active) => {
        controller = active;
      },
      () => cancelled,
      setView
    );
    return () => {
      cancelled = true;
      controller?.stop();
    };
  }, [config]);
  return view;
}

async function runEmbedSession(
  config: EmbedConfig,
  events: Parameters<typeof startDesktopFlow>[0]['events'],
  setController: (controller: DesktopController) => void,
  isCancelled: () => boolean,
  update: (value: SetStateAction<EmbedViewState>) => void
): Promise<void> {
  try {
    const session = await startDesktopFlow({
      cpi: config.cpi,
      challengeId: config.challengeId,
      events,
    });
    if (isCancelled()) {
      session.stop();
      return;
    }
    setController(session);
    update((current) => ({ ...current, qr: session.qr }));
    postToHost(config.hostOrigin, { event: 'ready', sessionId: session.sessionId });
    const verdict = await session.result;
    if (isCancelled()) return;
    const token = await session.verdictToken();
    update((current) => ({ ...current, completion: verdict.verdict }));
    postToHost(config.hostOrigin, {
      event: 'result',
      sessionId: session.sessionId,
      verdict: verdict.verdict,
      reason: verdict.reason,
      token,
    });
  } catch (cause) {
    if (isCancelled() || (cause instanceof Error && cause.message === 'cancelled')) return;
    update((current) => ({ ...current, error: userFacingError(cause) }));
    postToHost(config.hostOrigin, { event: 'error', message: 'challenge_failed' });
  }
}
