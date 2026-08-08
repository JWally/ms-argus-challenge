import { useState } from 'react';
import { DrawingGradeReview } from './DrawingGradeReview.js';
import { DrawingPicturePlayer } from './DrawingPicturePlayer.js';
import { REQUIRED_DRAWINGS, shouldShowDrawingInstructions } from './drawing-challenge.js';
import type { RenderedDrawingPictures } from './drawing-picture-protocol.js';
import { summarizeDrawingSample, type DrawingSampleStats } from './drawing-sample.js';
import { gradeDrawingCanvas, type DrawingGrade } from './emnist-grader.js';
import { useDrawingCanvas } from './use-drawing-canvas.js';

interface DrawingBoardProps {
  pictures: RenderedDrawingPictures;
  expectedLetters: string[];
  disabled?: boolean;
  onComplete(): void;
}

interface DrawingHeaderProps {
  index: number;
}

type ReviewState =
  | { status: 'idle' | 'analyzing' }
  | { status: 'reviewed'; grade: DrawingGrade; stats: DrawingSampleStats }
  | { status: 'error' };

type DrawingCanvasState = ReturnType<typeof useDrawingCanvas>;

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

function actionLabel(review: ReviewState, index: number): string {
  if (review.status === 'idle') return 'CHECK';
  if (review.status === 'analyzing') return 'ANALYZING';
  return index + 1 === REQUIRED_DRAWINGS ? 'DONE' : 'NEXT';
}

function useDrawingBoard(props: DrawingBoardProps) {
  const { expectedLetters, disabled = false, onComplete } = props;
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState<ReviewState>({ status: 'idle' });
  const drawing = useDrawingCanvas(index, disabled || review.status !== 'idle');
  const advance = (): void => {
    if (index + 1 >= REQUIRED_DRAWINGS) onComplete();
    else setIndex((current) => current + 1);
  };
  const analyze = async (): Promise<void> => {
    const canvas = drawing.canvasReference.current;
    if (!canvas || !drawing.hasInk || review.status !== 'idle') return;
    const stats = summarizeDrawingSample(drawing.strokes());
    setReview({ status: 'analyzing' });
    try {
      const expectedLetter = expectedLetters[index];
      if (!expectedLetter) throw new Error('drawing_target_unavailable');
      setReview({
        status: 'reviewed',
        grade: await gradeDrawingCanvas(canvas, expectedLetter),
        stats,
      });
    } catch {
      setReview({ status: 'error' });
    }
  };
  const progress = (): void => {
    if (review.status === 'idle') {
      void analyze();
      return;
    }
    if (review.status === 'analyzing') return;
    setReview({ status: 'idle' });
    advance();
  };
  const erase = (): void => {
    setReview({ status: 'idle' });
    drawing.clear();
  };
  return { index, review, drawing, progress, erase, disabled };
}

function GradeStatus({ review }: { review: ReviewState }) {
  return (
    <div className="drawing-grade-status" aria-live="polite">
      {review.status === 'analyzing' && <div className="drawing-grade-analyzing">CLASSIFYING…</div>}
      {review.status === 'reviewed' && (
        <DrawingGradeReview grade={review.grade} stats={review.stats} />
      )}
      {review.status === 'error' && (
        <div className="drawing-grade-error">
          <strong>GRADER UNAVAILABLE</strong>
          <span>You can continue this secure check.</span>
        </div>
      )}
    </div>
  );
}

function DrawingSurface({
  index,
  drawing,
  review,
}: {
  index: number;
  drawing: DrawingCanvasState;
  review: ReviewState;
}) {
  return (
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
      <GradeStatus review={review} />
    </div>
  );
}

function DrawingActions({
  state,
  progress,
  erase,
}: {
  state: ReturnType<typeof useDrawingBoard>;
  progress(): void;
  erase(): void;
}) {
  const { drawing, disabled, index, review } = state;
  return (
    <div className="drawing-actions">
      <button
        type="button"
        className="button drawing-submit"
        disabled={!drawing.hasInk || disabled || review.status === 'analyzing'}
        onClick={progress}
      >
        {actionLabel(review, index)}
      </button>
      <button
        type="button"
        className="button drawing-erase"
        disabled={!drawing.hasInk || disabled}
        onClick={erase}
      >
        ERASE
      </button>
    </div>
  );
}

export function DrawingBoard(props: DrawingBoardProps) {
  const state = useDrawingBoard(props);
  const { pictures } = props;
  const { drawing, erase, index, progress, review } = state;
  return (
    <section className="bio-draw" aria-label="Handwriting challenge">
      <DrawingHeader index={index} />
      <main className="bio-draw-main">
        <div className="bio-draw-challenge" aria-label={`Drawing prompt ${index + 1}`}>
          <span>DRAW</span>
          <DrawingPicturePlayer pictures={pictures} promptIndex={index} />
        </div>
        <DrawingSurface index={index} drawing={drawing} review={review} />
        <span className="drawing-model-label">HANDWRITING // EMNIST CNN</span>
        <DrawingActions state={state} progress={progress} erase={erase} />
      </main>
    </section>
  );
}
