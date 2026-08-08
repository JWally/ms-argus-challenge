import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DrawingGradeReview } from './DrawingGradeReview.js';

const stats = {
  strokes: 2,
  samples: 42,
  durationMs: 640,
  pathLength: 320,
  averageSpeed: 500,
  peakSpeed: 900,
  smoothness: 74,
  directionEntropy: 2.1,
  coalesced: 80,
  pressure: 0.5,
  contactArea: 120,
};

describe('drawing grade review', () => {
  it('presents the recognized letter, quality score, and sample metrics', () => {
    const markup = renderToStaticMarkup(
      createElement(DrawingGradeReview, {
        grade: {
          targetLetter: 'A',
          recognizedLetter: 'A',
          confidence: 0.82,
          confidences: [],
          qualityScore: 82,
          letterGrade: 'B',
          isCorrect: true,
          candidates: [
            { letter: 'A', confidence: 0.82 },
            { letter: 'R', confidence: 0.1 },
            { letter: 'N', confidence: 0.04 },
          ],
        },
        stats,
      })
    );

    expect(markup).toContain('GRADE B');
    expect(markup).toContain('<b>A</b>');
    expect(markup).toContain('82%');
    expect(markup).toContain('MATCH TO “A”');
    expect(markup).toContain('MODEL READ A / R / N');
    expect(markup).toContain('Smoothness');
  });
});
