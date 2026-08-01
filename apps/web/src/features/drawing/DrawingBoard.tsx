import { useState } from 'react';
import { DrawingPicturePlayer } from './DrawingPicturePlayer.js';
import { REQUIRED_DRAWINGS, shouldShowDrawingInstructions } from './drawing-challenge.js';
import type { RenderedDrawingPictures } from './drawing-picture-protocol.js';
import { useDrawingCanvas } from './use-drawing-canvas.js';

interface DrawingBoardProps {
  pictures: RenderedDrawingPictures;
  disabled?: boolean;
  onComplete(): void;
}

interface DrawingHeaderProps {
  index: number;
}

function DrawingHeader({ index }: DrawingHeaderProps) {
  return (
    <header className="bio-draw-header">
      <h1 className="bio-draw-title">
        ARGUS <span>PAIR</span>
      </h1>
      <p className="bio-draw-subtitle">Handwriting Biometric Captcha</p>
      <div className="drawing-progress" aria-label={`Drawing ${index + 1} of ${REQUIRED_DRAWINGS}`}>
        {Array.from({ length: REQUIRED_DRAWINGS }, (_, step) => (
          <span key={step} className={step <= index ? 'active' : ''} />
        ))}
      </div>
    </header>
  );
}

export function DrawingBoard({ pictures, disabled = false, onComplete }: DrawingBoardProps) {
  const [index, setIndex] = useState(0);
  const drawing = useDrawingCanvas(index, disabled);
  const advance = (): void => {
    if (index + 1 >= REQUIRED_DRAWINGS) onComplete();
    else setIndex((current) => current + 1);
  };
  return (
    <section className="bio-draw" aria-label="Handwriting challenge">
      <DrawingHeader index={index} />
      <main className="bio-draw-main">
        <div className="bio-draw-challenge" aria-label={`Drawing prompt ${index + 1}`}>
          <span>DRAW</span>
          <DrawingPicturePlayer pictures={pictures} promptIndex={index} />
        </div>
        <div className={`drawing-surface${drawing.hasInk ? ' has-ink' : ''}`}>
          <canvas
            ref={drawing.canvasReference}
            aria-label={`Draw prompt ${index + 1}`}
            onPointerDown={drawing.begin}
            onPointerMove={drawing.move}
            onPointerUp={drawing.end}
            onPointerCancel={drawing.end}
          />
          {shouldShowDrawingInstructions(index, drawing.hasStarted) && (
            <span className="drawing-hint">
              <span className="drawing-touch-cue" aria-hidden="true" />
              <span className="drawing-hint-text">Draw the Letter Here</span>
            </span>
          )}
        </div>
        <div className="drawing-actions">
          <button
            type="button"
            className="button drawing-submit"
            disabled={!drawing.hasInk || disabled}
            onClick={advance}
          >
            {index + 1 === REQUIRED_DRAWINGS ? 'DONE' : 'NEXT'}
          </button>
          <button
            type="button"
            className="button drawing-erase"
            disabled={!drawing.hasInk || disabled}
            onClick={drawing.clear}
          >
            ERASE
          </button>
        </div>
      </main>
    </section>
  );
}
