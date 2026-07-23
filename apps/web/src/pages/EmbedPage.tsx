import { useMemo, useRef } from 'react';
import { readEmbedConfig } from '../features/embed/embed-config.js';
import { EmbedView } from '../features/embed/EmbedView.js';
import { embedPresentation } from '../features/embed/embed-presentation.js';
import {
  useEmbedSession,
  useHostCompact,
  useHostSize,
} from '../features/embed/use-embed-session.js';
import { useQrFrames } from '../features/embed/use-qr-frames.js';

export function EmbedPage() {
  const root = useRef<HTMLDivElement>(null);
  const config = useMemo(() => readEmbedConfig(window.location.search), []);
  const view = useEmbedSession(config);
  const frame = useQrFrames(view.qr);
  const compact = useHostCompact(config?.hostOrigin ?? null);
  useHostSize(root, config?.hostOrigin ?? null);
  if (!config) {
    return <main className="embed-shell error-panel">Invalid challenge configuration.</main>;
  }
  const presentation = embedPresentation({
    status: view.status,
    completion: view.error ? 'failed' : view.completion,
  });
  return (
    <EmbedView
      moduleReference={root}
      frame={frame}
      presentation={presentation}
      error={view.error}
      compact={compact}
    />
  );
}
