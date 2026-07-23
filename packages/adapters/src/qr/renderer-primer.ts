import { renderPairQrFrames } from './server-qr-renderer.js';

type RenderQr = () => Promise<unknown>;

// Match the production token length so priming exercises the same QR geometry.
const WARMUP_PAIR_TOKEN = '0000000000000000000000';
const DEFAULT_REFRESH_AFTER_MILLISECONDS = 5_000;

interface QrRendererPrimerOptions {
  nowMilliseconds?: () => number;
  refreshAfterMilliseconds?: number;
}

export function createQrRendererPrimer(
  renderQr: RenderQr,
  options: QrRendererPrimerOptions = {}
): () => Promise<boolean> {
  const nowMilliseconds = options.nowMilliseconds ?? Date.now;
  const refreshAfterMilliseconds =
    options.refreshAfterMilliseconds ?? DEFAULT_REFRESH_AFTER_MILLISECONDS;
  let renderInFlight: Promise<unknown> | undefined;
  let lastRenderedAt: number | undefined;
  return async () => {
    if (renderInFlight) {
      await renderInFlight;
      return false;
    }
    if (
      lastRenderedAt !== undefined &&
      nowMilliseconds() - lastRenderedAt < refreshAfterMilliseconds
    ) {
      return false;
    }
    const attempt = Promise.resolve().then(renderQr);
    renderInFlight = attempt;
    try {
      await attempt;
      lastRenderedAt = nowMilliseconds();
      return true;
    } finally {
      if (renderInFlight === attempt) renderInFlight = undefined;
    }
  };
}

export function createServerQrRendererPrimer(pairOrigin: string): () => Promise<boolean> {
  return createQrRendererPrimer(() =>
    renderPairQrFrames(pairOrigin, WARMUP_PAIR_TOKEN).then(() => undefined)
  );
}
