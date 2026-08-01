import { describe, expect, it } from 'vitest';
import { drawingPictureLetterMaskStyle } from './picture-readability.js';

describe('drawing picture readability', () => {
  it('keeps B, R, and K masks canonical when visual distinction matters', () => {
    const normal = drawingPictureLetterMaskStyle('S');
    const b = drawingPictureLetterMaskStyle('B');
    const r = drawingPictureLetterMaskStyle('R');
    const k = drawingPictureLetterMaskStyle('K');

    expect(b.scaleX).toBeGreaterThan(normal.scaleX);
    expect(r.scaleX).toBeGreaterThan(b.scaleX);
    expect(k.scaleX).toBeGreaterThan(normal.scaleX);
    expect(r.scaleX).toBeGreaterThan(k.scaleX);
    expect(r.rotationScale).toBeLessThan(normal.rotationScale);
    expect(k.skewScale).toBeLessThan(normal.skewScale);
  });
});
