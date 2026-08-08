import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMNIST_INPUT_PIXELS, inferEmnistLetter, parseEmnistWeights } from './emnist-inference.js';
import { gradeEmnistRecognition } from './emnist-grader.js';
import { normalizeDrawingImage } from './emnist-preprocess.js';

function image(width: number, height: number, ink: Array<[number, number]>): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of ink) {
    const offset = (y * width + x) * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  return { width, height, data, colorSpace: 'srgb' };
}

describe('EMNIST drawing grader', () => {
  it('crops, scales, and centers phone ink into a 28 by 28 raster', () => {
    const ink = Array.from({ length: 28 }, (_, index) => [8, 12 + index] as [number, number]);
    const normalized = normalizeDrawingImage(image(80, 60, ink));

    expect(normalized).toHaveLength(EMNIST_INPUT_PIXELS);
    expect(Math.max(...normalized)).toBeGreaterThan(0.4);
    const nonzero = Array.from(normalized, (value, index) => ({ value, index })).filter(
      ({ value }) => value > 0.05
    );
    const meanX = nonzero.reduce((sum, { index }) => sum + (index % 28), 0) / nonzero.length;
    expect(meanX).toBeGreaterThan(12);
    expect(meanX).toBeLessThan(16);
  });

  it('returns an empty raster for a blank drawing', () => {
    expect(normalizeDrawingImage(image(40, 30, []))).toEqual(new Float32Array(EMNIST_INPUT_PIXELS));
  });

  it('runs the committed 26-letter model and returns normalized confidences', () => {
    const model = readFileSync(new URL('../../../public/emnist-weights.bin', import.meta.url));
    const weights = parseEmnistWeights(
      model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength)
    );
    const raster = new Float32Array(EMNIST_INPUT_PIXELS);
    for (let y = 5; y < 23; y += 1) raster[y * 28 + 14] = 1;

    const grade = inferEmnistLetter(raster, weights);

    expect(grade.letter).toMatch(/^[A-Z]$/);
    expect(grade.confidence).toBeGreaterThan(0);
    expect(grade.confidences).toHaveLength(26);
    expect(grade.confidences.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
  });

  it('grades the requested letter probability on a 0-100 and A-F scale', () => {
    const confidences = new Array<number>(26).fill(0.001);
    confidences[0] = 0.91;
    confidences[17] = 0.04;

    expect(
      gradeEmnistRecognition({ letter: 'A', confidence: 0.91, confidences }, 'A')
    ).toMatchObject({
      targetLetter: 'A',
      recognizedLetter: 'A',
      qualityScore: 91,
      letterGrade: 'A',
      isCorrect: true,
    });
    expect(
      gradeEmnistRecognition({ letter: 'A', confidence: 0.91, confidences }, 'R')
    ).toMatchObject({
      targetLetter: 'R',
      recognizedLetter: 'A',
      qualityScore: 4,
      letterGrade: 'F',
      isCorrect: false,
    });
  });

  it.each([
    [90, 'A'],
    [89, 'B'],
    [79, 'C'],
    [69, 'D'],
    [59, 'F'],
  ])('maps a %i score to grade %s', (qualityScore, letterGrade) => {
    const confidences = new Array<number>(26).fill(0);
    confidences[0] = qualityScore / 100;
    expect(
      gradeEmnistRecognition({ letter: 'A', confidence: qualityScore / 100, confidences }, 'A')
        .letterGrade
    ).toBe(letterGrade);
  });
});
