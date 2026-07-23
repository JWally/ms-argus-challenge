import { useMemo, useState } from 'react';
import { DotLetterPlate } from './DotLetterPlate.js';
import {
  drawingChallenge,
  REQUIRED_DRAWINGS,
  shouldShowDrawingInstructions,
} from './drawing-challenge.js';
import { useDrawingCanvas } from './use-drawing-canvas.js';

interface DrawingBoardProps {
  nonce: string;
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

export function DrawingBoard({ nonce, disabled = false, onComplete }: DrawingBoardProps) {
  const [index, setIndex] = useState(0);
  const prompt = useMemo(() => drawingChallenge(nonce, index), [nonce, index]);
  const drawing = useDrawingCanvas(index, disabled);
  const advance = (): void => {
    if (index + 1 >= REQUIRED_DRAWINGS) onComplete();
    else setIndex((current) => current + 1);
  };
  return (
    <section className="bio-draw" aria-label="Handwriting challenge">
      <DrawingHeader index={index} />
      <main className="bio-draw-main">
        <div className="bio-draw-challenge" aria-label={`Draw ${prompt.letter}`}>
          <span>DRAW</span>
          <DotLetterPlate letter={prompt.letter} seed={prompt.seed} />
        </div>
        <div className={`drawing-surface${drawing.hasInk ? ' has-ink' : ''}`}>
          <canvas
            ref={drawing.canvasReference}
            aria-label={`Draw the letter ${prompt.letter}`}
            onPointerDown={drawing.begin}
            onPointerMove={drawing.move}
            onPointerUp={drawing.end}
            onPointerCancel={drawing.end}
          />
          {shouldShowDrawingInstructions(index, drawing.hasStarted) && (
            <span className="drawing-hint">
              Draw the Character You See Above
              <small>-- CLICK HERE TO START --</small>
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
