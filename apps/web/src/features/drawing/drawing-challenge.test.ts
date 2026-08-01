import { describe, expect, it } from 'vitest';
import { REQUIRED_DRAWINGS, shouldShowDrawingInstructions } from './drawing-challenge.js';

describe('drawingChallenge', () => {
  it('keeps the drawing count local without deriving prompt letters in the browser', () => {
    expect(REQUIRED_DRAWINGS).toBe(3);
  });

  it('shows drawing guidance only before the first stroke of the whole challenge', () => {
    expect(shouldShowDrawingInstructions(0, false)).toBe(true);
    expect(shouldShowDrawingInstructions(0, true)).toBe(false);
    expect(shouldShowDrawingInstructions(1, false)).toBe(false);
    expect(shouldShowDrawingInstructions(2, false)).toBe(false);
  });
});
