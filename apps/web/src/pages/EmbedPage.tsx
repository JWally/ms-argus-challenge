import { useMemo, useRef } from 'react';
import { readEmbedConfig } from '../features/embed/embed-config.js';
import { useEmbedSession, useHostSize } from '../features/embed/use-embed-session.js';
import { useQrFrames } from '../features/embed/use-qr-frames.js';

export function EmbedPage() {
  const root = useRef<HTMLElement>(null);
  const config = useMemo(() => readEmbedConfig(window.location.search), []);
  const view = useEmbedSession(config);
  const frame = useQrFrames(view.qr);
  useHostSize(root, config?.hostOrigin ?? null);
  if (!config) {
    return <main className="embed-shell error-panel">Invalid challenge configuration.</main>;
  }
  return (
    <main ref={root} className="embed-shell">
      <div className="brand-mark">
        argus<span>.challenge</span>
      </div>
      {view.completion ? (
        <section className={`completion ${view.completion}`}>
          <span className="completion-icon">{view.completion === 'paired' ? '✓' : '×'}</span>
          <h1>{view.completion === 'paired' ? 'Verified' : 'Not verified'}</h1>
          <p>{view.completion === 'paired' ? 'You can continue.' : 'Please try again.'}</p>
        </section>
      ) : (
        <section className="qr-panel">
          <div className="qr-stage">
            {frame ? (
              <img src={frame} alt="Scan this secure QR code with your phone" />
            ) : (
              <span className="spinner" />
            )}
          </div>
          <h1>{view.status}</h1>
          <p>Use your phone camera, then complete the handwriting check.</p>
        </section>
      )}
      {view.error && (
        <p role="alert" className="error-copy">
          {view.error}
        </p>
      )}
      <footer>
        <span className="status-dot" /> Protected by Argus
      </footer>
    </main>
  );
}
