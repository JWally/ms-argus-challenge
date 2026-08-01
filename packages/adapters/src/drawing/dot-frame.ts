import { seededRandom } from './renderer-random.js';

const GRID_SPACING = 4;
const GRID_MARGIN = 2;
const LETTER_THRESHOLD = 16;
const LETTER_DOT_SAMPLE_RATE = 0.62;
const BG_DOT_VALUE = 5;
const BG_DOT_SPREAD = 7;

interface DotFrameInput {
  letter: string;
  variantIndex: number;
  frameIndex: number;
  framesPerPrompt: number;
  mask: Uint8Array;
  width: number;
  height: number;
}

interface RasterDimensions {
  width: number;
  height: number;
}

interface DotSpec {
  x: number;
  y: number;
  radius: number;
  value: number;
}

export function variantSeed(letter: string, variantIndex: number): string {
  return `drawing-picture:${letter}:${variantIndex}`;
}

export function catalogKey(letter: string, variantIndex: number, frameIndex: number): string {
  return `${letter}:${variantIndex}:${frameIndex}`;
}

interface FrameCacheKeyInput {
  encoding: string;
  width: number;
  height: number;
  letter: string;
  variantIndex: number;
  frameIndex: number;
  framesPerPrompt: number;
}

export function frameCacheKey(input: FrameCacheKeyInput): string {
  return `${input.encoding}:${input.width}x${input.height}:${input.framesPerPrompt}:${catalogKey(
    input.letter,
    input.variantIndex,
    input.frameIndex
  )}`;
}

export function maskCacheKey(
  width: number,
  height: number,
  letter: string,
  variantIndex: number
): string {
  return `${width}x${height}:${letter}:${variantIndex}`;
}

function sample(mask: Uint8Array, width: number, height: number, x: number, y: number): number {
  const pixelX = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const pixelY = Math.max(0, Math.min(height - 1, Math.floor(y)));
  return mask[pixelY * width + pixelX] ?? 0;
}

function drawDot(output: Uint8Array, dimensions: RasterDimensions, dot: DotSpec): void {
  const left = Math.max(0, Math.floor(dot.x - dot.radius));
  const right = Math.min(dimensions.width - 1, Math.ceil(dot.x + dot.radius));
  const top = Math.max(0, Math.floor(dot.y - dot.radius));
  const bottom = Math.min(dimensions.height - 1, Math.ceil(dot.y + dot.radius));
  for (let pixelY = top; pixelY <= bottom; pixelY += 1) {
    for (let pixelX = left; pixelX <= right; pixelX += 1) {
      const distance = Math.hypot(pixelX - dot.x, pixelY - dot.y);
      if (distance > dot.radius) continue;
      const offset = pixelY * dimensions.width + pixelX;
      const falloff = 1 - distance / Math.max(dot.radius, 1);
      output[offset] = Math.max(
        output[offset] ?? 0,
        Math.round(dot.value * (0.55 + falloff * 0.45))
      );
    }
  }
}

function drawGridDots(input: DotFrameInput, output: Uint8Array, next: () => number): void {
  const dimensions = { width: input.width, height: input.height };
  for (let row = GRID_MARGIN; row < input.height - GRID_MARGIN; row += GRID_SPACING) {
    for (let column = GRID_MARGIN; column < input.width - GRID_MARGIN; column += GRID_SPACING) {
      const x = column + (next() - 0.5) * GRID_SPACING * 0.5;
      const y = row + (next() - 0.5) * GRID_SPACING * 0.5;
      const intensity = sample(input.mask, input.width, input.height, x, y);
      const activeLetter = intensity > LETTER_THRESHOLD && next() <= LETTER_DOT_SAMPLE_RATE;
      drawDot(output, dimensions, {
        x,
        y,
        radius: activeLetter ? 0.65 + next() * 0.55 : 0.35 + next() * 0.45,
        value: activeLetter ? 125 + next() * 75 : BG_DOT_VALUE + next() * BG_DOT_SPREAD,
      });
    }
  }
}

function drawNoiseDots(input: DotFrameInput, output: Uint8Array, next: () => number): void {
  const dimensions = { width: input.width, height: input.height };
  const count = Math.max(2, Math.round((input.width * input.height) / 2200));
  for (let index = 0; index < count; index += 1) {
    const x = 2 + next() * Math.max(1, input.width - 4);
    const y = 2 + next() * Math.max(1, input.height - 4);
    drawDot(output, dimensions, { x, y, radius: 0.35 + next() * 0.6, value: 6 + next() * 12 });
  }
}

export function renderDotFrame(input: DotFrameInput): Uint8Array {
  if (input.mask.byteLength !== input.width * input.height) {
    throw new Error('invalid_drawing_picture_bytes');
  }
  const output = new Uint8Array(input.width * input.height);
  const next = seededRandom(
    `${input.letter}:${input.variantIndex}:${input.frameIndex}:${input.framesPerPrompt}`
  );
  drawGridDots(input, output, next);
  drawNoiseDots(input, output, next);
  return output;
}
