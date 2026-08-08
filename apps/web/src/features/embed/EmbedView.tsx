import type { RefObject } from 'react';
import { EmbedSeal, EyeMark, MonitorIcon, PhoneIcon } from './EmbedIcons.js';
import type { EmbedPresentation } from './embed-presentation.js';

interface EmbedViewProps {
  moduleReference: RefObject<HTMLDivElement | null>;
  frame: string | null;
  presentation: EmbedPresentation;
  error: string | null;
  compact: boolean;
}

function ScanPanel({ frame, phase }: { frame: string | null; phase: EmbedPresentation['phase'] }) {
  return (
    <div className="ax-scan">
      <div className="ax-tile">
        {frame ? (
          <img src={frame} alt="Scan this secure QR code with your phone" />
        ) : (
          <span className="ax-tile-load" aria-label="Preparing secure QR code" />
        )}
      </div>
      <div className="ax-seal">
        <EmbedSeal phase={phase} />
      </div>
      <span className="ax-tick tl" />
      <span className="ax-tick tr" />
      <span className="ax-tick bl" />
      <span className="ax-tick br" />
    </div>
  );
}

function DeviceLink({ presentation }: { presentation: EmbedPresentation }) {
  const connected = presentation.phase !== 'scanning' && presentation.phase !== 'expired';
  return (
    <div className="ax-link">
      <div className="ax-node here">
        <span className="ax-chip">
          <MonitorIcon />
        </span>
        <span className="ax-tag">THIS DEVICE</span>
      </div>
      <div className="ax-track">
        <span className="ax-track-label" aria-hidden="true">
          {presentation.trackStatus}
        </span>
        <span className="ax-rail" />
        <span className="ax-live" />
        <span className="ax-pulse" />
      </div>
      <div className={`ax-node${connected ? ' here' : ''}`}>
        <span className="ax-chip">
          <PhoneIcon />
        </span>
        <span className="ax-tag">YOUR PHONE</span>
      </div>
    </div>
  );
}

export function EmbedView({
  moduleReference,
  frame,
  presentation,
  error,
  compact,
}: EmbedViewProps) {
  return (
    <main className="aegis-stage">
      <div
        ref={moduleReference}
        className={`aegis ${presentation.phase}${compact ? ' compact' : ''}`}
      >
        <header className="ax-bar">
          <div className="ax-brand">
            <EyeMark />
            <span className="ax-name">ARGUS</span>
          </div>
          <span className="ax-stat" aria-label={`Challenge ${presentation.phase}`}>
            <span className="ax-dot" />
          </span>
        </header>

        <ScanPanel frame={frame} phase={presentation.phase} />

        <h1 className="ax-label" aria-live="polite">
          {presentation.title}
          <span className="ax-sub">{presentation.instruction}</span>
        </h1>
        {error && (
          <p className="ax-error" role="alert">
            {error}
          </p>
        )}

        <DeviceLink presentation={presentation} />
      </div>
    </main>
  );
}
