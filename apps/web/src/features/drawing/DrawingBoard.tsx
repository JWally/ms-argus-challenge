import { useMemo, useState } from 'react';
import { drawingChallenge, REQUIRED_DRAWINGS } from './drawing-challenge.js';
import { useDrawingCanvas } from './use-drawing-canvas.js';

interface DrawingBoardProps {
  nonce: string;
  disabled?: boolean;
  onComplete(): void;
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
    <section className="drawing-board" aria-label="Handwriting challenge">
      <header className="drawing-header">
        <p className="eyebrow">Handwriting check</p>
        <div
          className="drawing-progress"
          aria-label={`Drawing ${index + 1} of ${REQUIRED_DRAWINGS}`}
        >
          {Array.from({ length: REQUIRED_DRAWINGS }, (_, step) => (
            <span key={step} className={step <= index ? 'active' : ''} />
          ))}
        </div>
      </header>
      <div className="drawing-prompt">
        <span>Draw this letter</span>
        <strong aria-label={`Letter ${prompt.letter}`}>{prompt.letter}</strong>
      </div>
      <div className="drawing-surface">
        <canvas
          ref={drawing.canvasReference}
          aria-label={`Draw the letter ${prompt.letter}`}
          onPointerDown={drawing.begin}
          onPointerMove={drawing.move}
          onPointerUp={drawing.end}
          onPointerCancel={drawing.end}
        />
        {!drawing.hasInk && <span className="drawing-hint">Draw with your finger</span>}
      </div>
      <div className="drawing-actions">
        <button
          type="button"
          className="button secondary"
          disabled={!drawing.hasInk || disabled}
          onClick={drawing.clear}
        >
          Erase
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!drawing.hasInk || disabled}
          onClick={advance}
        >
          {index + 1 === REQUIRED_DRAWINGS ? 'Finish' : 'Next letter'}
        </button>
      </div>
    </section>
  );
}
