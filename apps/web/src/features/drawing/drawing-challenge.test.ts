import { describe, expect, it } from 'vitest';
import { drawingChallenge, REQUIRED_DRAWINGS } from './drawing-challenge.js';

describe('drawingChallenge', () => {
  it('selects the same unambiguous letter for the same nonce and index', () => {
    expect(drawingChallenge('nonce-value-123456', 1)).toEqual(
      drawingChallenge('nonce-value-123456', 1)
    );
  });

  it('changes its seed across the required challenge sequence', () => {
    const values = Array.from({ length: REQUIRED_DRAWINGS }, (_, index) =>
      drawingChallenge('nonce-value-123456', index)
    );
    expect(new Set(values.map(({ seed }) => seed)).size).toBe(REQUIRED_DRAWINGS);
    expect(values.every(({ letter }) => !/[IO]/.test(letter))).toBe(true);
  });
});
