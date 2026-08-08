import { describe, expect, it } from 'vitest';
import { summarizeDrawingSample, type DrawingStroke } from './drawing-sample.js';

describe('drawing sample summary', () => {
  it('summarizes the local pointer sample shown with the grade', () => {
    const strokes: DrawingStroke[] = [
      [
        {
          x: 0,
          y: 0,
          t: 100,
          pressure: 0.4,
          contactWidth: 10,
          contactHeight: 12,
          coalescedCount: 0,
        },
        {
          x: 30,
          y: 40,
          t: 200,
          pressure: 0.6,
          contactWidth: 12,
          contactHeight: 14,
          coalescedCount: 2,
        },
      ],
    ];

    expect(summarizeDrawingSample(strokes)).toMatchObject({
      strokes: 1,
      samples: 2,
      durationMs: 100,
      pathLength: 50,
      averageSpeed: 500,
      peakSpeed: 500,
      pressure: 0.5,
      contactArea: 144,
      coalesced: 100,
    });
  });

  it('returns zeroed statistics without a sample', () => {
    expect(summarizeDrawingSample([])).toMatchObject({
      strokes: 0,
      samples: 0,
      durationMs: 0,
      pathLength: 0,
    });
  });
});
