import { useState } from 'react';
import { DrawingGradeReview } from '../drawing/DrawingGradeReview.js';
import { summarizeDrawingSample, type DrawingSampleStats } from '../drawing/drawing-sample.js';
import { gradeDrawingCanvas, type DrawingGrade } from '../drawing/emnist-grader.js';
import { useDrawingCanvas } from '../drawing/use-drawing-canvas.js';

type SsoStep = 1 | 2 | 3;

interface SsoDrawingInterstitialProps {
  step: SsoStep;
  ready: boolean;
  onContinue(): void;
}

type ReviewState =
  | { status: 'idle' | 'analyzing' }
  | { status: 'reviewed'; grade: DrawingGrade; stats: DrawingSampleStats }
  | { status: 'error' };

const LETTERS = ['A', 'R', 'G'] as const;

export function ssoDrawingPrompt(step: SsoStep): string {
  return LETTERS[step - 1] ?? 'A';
}

export function ssoDrawingActionLabel(step: SsoStep, reviewed: boolean): string {
  if (!reviewed) return 'CHECK';
  return step === 3 ? 'DONE' : 'NEXT';
}

function GradeStatus({ review }: { review: ReviewState }) {
  if (review.status === 'reviewed') {
    return <DrawingGradeReview grade={review.grade} stats={review.stats} />;
  }
  if (review.status === 'analyzing') {
    return <div className="drawing-grade-analyzing">CLASSIFYING…</div>;
  }
  if (review.status === 'error') {
    return (
      <div className="drawing-grade-error">
        <strong>GRADER UNAVAILABLE</strong>
        <span>Your drawing was captured. You can continue.</span>
      </div>
    );
  }
  return null;
}

function useSsoDrawing(step: SsoStep, ready: boolean, onContinue: () => void) {
  const [review, setReview] = useState<ReviewState>({ status: 'idle' });
  const reviewed = review.status === 'reviewed' || review.status === 'error';
  const drawing = useDrawingCanvas(step, review.status !== 'idle');

  const primary = async (): Promise<void> => {
    if (reviewed) {
      if (ready) onContinue();
      return;
    }
    const canvas = drawing.canvasReference.current;
    if (!canvas || !drawing.hasInk || review.status !== 'idle') return;
    const stats = summarizeDrawingSample(drawing.strokes());
    setReview({ status: 'analyzing' });
    try {
      setReview({
        status: 'reviewed',
        grade: await gradeDrawingCanvas(canvas, ssoDrawingPrompt(step)),
        stats,
      });
    } catch {
      setReview({ status: 'error' });
    }
  };

  const erase = (): void => {
    setReview({ status: 'idle' });
    drawing.clear();
  };
  const primaryDisabled =
    review.status === 'analyzing' || (!reviewed && !drawing.hasInk) || (reviewed && !ready);
  return { drawing, erase, primary, primaryDisabled, ready, review, reviewed };
}

type SsoDrawingState = ReturnType<typeof useSsoDrawing>;

function DrawingHeader({ step }: { step: SsoStep }) {
  return (
    <>
      <header className="sso-drawing-header">
        <div>
          <span className="sso-drawing-brand">ARGUS CAPTCHA</span>
          <h1>Secure session check</h1>
        </div>
        <span className="sso-drawing-step">Step {step} of 3</span>
      </header>
      <ol className="sso-drawing-progress" aria-hidden="true">
        {LETTERS.map((_, index) => (
          <li className={index + 1 <= step ? 'is-active' : ''} key={index} />
        ))}
      </ol>
    </>
  );
}

function DrawingTask({ letter, state }: { letter: string; state: SsoDrawingState }) {
  return (
    <section className="sso-drawing-task" aria-label={`Draw the letter ${letter}`}>
      <div className="sso-drawing-prompt">
        <span>DRAW</span>
        <strong>{letter}</strong>
      </div>
      <div
        className={`drawing-surface sso-drawing-surface${state.drawing.hasInk ? ' has-ink' : ''}`}
      >
        <canvas
          ref={state.drawing.canvasReference}
          aria-label={`Draw the letter ${letter}`}
          onPointerDown={state.drawing.begin}
          onPointerMove={state.drawing.move}
          onPointerUp={state.drawing.end}
          onPointerCancel={state.drawing.end}
        />
        {!state.drawing.hasStarted && (
          <span className="drawing-hint">
            <span className="drawing-touch-cue" aria-hidden="true" />
            <span className="drawing-hint-text">Draw the Letter Here</span>
          </span>
        )}
        <div className="drawing-grade-status">
          <GradeStatus review={state.review} />
        </div>
      </div>
    </section>
  );
}

function DrawingFooter({ step, state }: { step: SsoStep; state: SsoDrawingState }) {
  const label =
    state.review.status === 'analyzing' ? 'ANALYZING' : ssoDrawingActionLabel(step, state.reviewed);
  return (
    <footer className="sso-drawing-footer">
      <div className="sso-drawing-readiness">
        <span className={state.ready ? 'is-ready' : ''} aria-hidden="true" />
        {state.ready ? 'Secure check complete' : 'Secure check in progress'}
      </div>
      <span className="drawing-model-label">HANDWRITING // EMNIST CNN</span>
      <div className="drawing-actions">
        <button
          type="button"
          className={`button drawing-submit${state.ready && state.reviewed ? ' is-ready' : ''}`}
          disabled={state.primaryDisabled}
          onClick={() => void state.primary()}
        >
          {label}
        </button>
        <button
          type="button"
          className="button drawing-erase"
          disabled={!state.drawing.hasInk || state.review.status === 'analyzing'}
          onClick={state.erase}
        >
          ERASE
        </button>
      </div>
    </footer>
  );
}

export function SsoDrawingInterstitial({ step, ready, onContinue }: SsoDrawingInterstitialProps) {
  const state = useSsoDrawing(step, ready, onContinue);
  return (
    <main className="sso-drawing-page" aria-live="polite">
      <DrawingHeader step={step} />
      <DrawingTask letter={ssoDrawingPrompt(step)} state={state} />
      <DrawingFooter step={step} state={state} />
    </main>
  );
}
