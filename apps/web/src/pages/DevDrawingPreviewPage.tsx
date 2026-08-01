import { useEffect, useMemo, useState } from 'react';
import { DrawingBoard } from '../features/drawing/DrawingBoard.js';
import type { RenderedDrawingPictures } from '../features/drawing/drawing-picture-protocol.js';
import { picturesForLetters, randomLetters } from './dev-drawing-preview-pictures.js';
import './dev-phone-preview.css';

function PreviewComplete({
  reroll,
  fullscreen = false,
}: {
  reroll: () => void;
  fullscreen?: boolean;
}) {
  return (
    <main className={`dev-phone-complete${fullscreen ? ' dev-phone-complete-fullscreen' : ''}`}>
      <div>
        <h2>Preview complete</h2>
        <button type="button" onClick={reroll}>
          Run again
        </button>
      </div>
    </main>
  );
}

function DebugToolbar({ letters, reroll }: { letters: string[]; reroll: () => void }) {
  return (
    <section className="dev-phone-toolbar" aria-label="Local preview controls">
      <div>
        <h1>Local phone UI preview</h1>
        <p>Debug letters: {letters.join(' ')}</p>
      </div>
      <button type="button" onClick={reroll}>
        Reroll
      </button>
    </section>
  );
}

function DebugPhoneFrame({
  isComplete,
  pictures,
  reroll,
  onComplete,
}: {
  isComplete: boolean;
  pictures: RenderedDrawingPictures | null;
  reroll: () => void;
  onComplete: () => void;
}) {
  return (
    <section className="dev-phone-frame" aria-label="Phone preview">
      {isComplete ? (
        <PreviewComplete reroll={reroll} />
      ) : !pictures ? (
        <PreparingPreview />
      ) : (
        <DrawingBoard pictures={pictures} onComplete={onComplete} />
      )}
    </section>
  );
}

function PreparingPreview() {
  return (
    <main className="dev-phone-complete">
      <div>
        <h2>Preparing prompt</h2>
        <p>Encoding local preview frames…</p>
      </div>
    </main>
  );
}

export function DevDrawingPreviewPage() {
  const [previewSeed, setPreviewSeed] = useState(() => crypto.randomUUID());
  const [isComplete, setIsComplete] = useState(false);
  const [pictures, setPictures] = useState<RenderedDrawingPictures | null>(null);
  const isDebug = new URLSearchParams(window.location.search).get('debug') === '1';
  const letters = useMemo(() => randomLetters(previewSeed), [previewSeed]);
  const complete = (): void => setIsComplete(true);
  const reroll = (): void => {
    setPreviewSeed(crypto.randomUUID());
    setIsComplete(false);
  };

  useEffect(() => {
    let isDisposed = false;
    setPictures(null);
    void picturesForLetters(letters, previewSeed).then((nextPictures) => {
      if (!isDisposed) setPictures(nextPictures);
    });
    return () => {
      isDisposed = true;
    };
  }, [letters, previewSeed]);

  if (!isDebug) {
    if (isComplete) return <PreviewComplete reroll={reroll} fullscreen />;
    return pictures ? (
      <DrawingBoard pictures={pictures} onComplete={complete} />
    ) : (
      <PreparingPreview />
    );
  }

  return (
    <main className="dev-phone-preview">
      <DebugToolbar letters={letters} reroll={reroll} />
      <DebugPhoneFrame
        isComplete={isComplete}
        pictures={pictures}
        reroll={reroll}
        onComplete={complete}
      />
    </main>
  );
}
