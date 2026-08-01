import {
  GLYPH_MASK_HEIGHT,
  GLYPH_MASK_WIDTH,
  GLYPH_VARIANTS,
} from '../../../../packages/contracts/src/drawing/glyph-masks.js';
import { GLYPH_VARIANT_INDEXES } from '../../../../packages/contracts/src/drawing/glyph-mask-selection.js';
import {
  HEIGHT,
  WIDTH,
  letterMaskStyle,
  seededUnit,
  variantSeed,
} from './dev-drawing-preview-model.js';

const GLYPH_HEIGHT_RATIO = 0.76;

/* jscpd:ignore-start */

function glyphVariants(letter: string): string[] {
  const normalized = letter.toUpperCase();
  const key = GLYPH_VARIANT_INDEXES[normalized] ? normalized : 'A';
  const variants = GLYPH_VARIANTS[key] ?? [];
  return (GLYPH_VARIANT_INDEXES[key] ?? []).map((index) => variants[index]!).filter(Boolean);
}

function glyphMask(letter: string, seed: string): Uint8Array {
  const variants = glyphVariants(letter);
  const encoded = variants[Math.floor(seededUnit(seed, 'glyph-variant') * variants.length)];
  if (!encoded) throw new Error('unsupported_preview_letter');
  const binary = atob(encoded);
  const mask = new Uint8Array(GLYPH_MASK_WIDTH * GLYPH_MASK_HEIGHT);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] =
      (binary.charCodeAt(Math.floor(index / 8)) ?? 0) & (1 << (7 - (index % 8))) ? 255 : 0;
  }
  return mask;
}

function cropGlyphMask(mask: Uint8Array): { mask: Uint8Array; width: number; height: number } {
  let minX = GLYPH_MASK_WIDTH;
  let minY = GLYPH_MASK_HEIGHT;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < GLYPH_MASK_HEIGHT; y += 1) {
    for (let x = 0; x < GLYPH_MASK_WIDTH; x += 1) {
      if ((mask[y * GLYPH_MASK_WIDTH + x] ?? 0) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY)
    return { mask, width: GLYPH_MASK_WIDTH, height: GLYPH_MASK_HEIGHT };

  const pad = 2;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(GLYPH_MASK_WIDTH - 1, maxX + pad);
  const bottom = Math.min(GLYPH_MASK_HEIGHT - 1, maxY + pad);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const cropped = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cropped[y * width + x] = mask[(top + y) * GLYPH_MASK_WIDTH + left + x] ?? 0;
    }
  }
  return { mask: cropped, width, height };
}

function glyphCanvas(source: {
  mask: Uint8Array;
  width: number;
  height: number;
}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('preview_canvas_missing');
  const image = context.createImageData(source.width, source.height);
  for (let index = 0; index < source.mask.length; index += 1) {
    const offset = index * 4;
    image.data[offset] = source.mask[index] ?? 0;
    image.data[offset + 1] = source.mask[index] ?? 0;
    image.data[offset + 2] = source.mask[index] ?? 0;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function drawJSerifAndHook(input: {
  context: CanvasRenderingContext2D;
  left: number;
  top: number;
  width: number;
  height: number;
}): void {
  const radius = Math.max(2, Math.round(input.height * 0.045));
  input.context.strokeStyle = '#fff';
  input.context.lineWidth = radius * 2;
  input.context.lineCap = 'round';
  input.context.lineJoin = 'round';

  const topY = input.top + input.height * 0.08;
  input.context.beginPath();
  input.context.moveTo(input.left + input.width * 0.28, topY);
  input.context.lineTo(input.left + input.width * 0.72, topY);
  input.context.stroke();

  input.context.beginPath();
  input.context.moveTo(input.left + input.width * 0.58, input.top + input.height * 0.74);
  input.context.lineTo(input.left + input.width * 0.56, input.top + input.height * 0.9);
  input.context.lineTo(input.left + input.width * 0.42, input.top + input.height * 0.99);
  input.context.lineTo(input.left + input.width * 0.24, input.top + input.height * 0.92);
  input.context.stroke();
}

function seededCenterWithinBounds(input: {
  seed: string;
  glyphWidth: number;
  glyphHeight: number;
}): { x: number; y: number } {
  const horizontalPadding = Math.max(4, input.glyphWidth * 0.05);
  const verticalPadding = Math.max(4, input.glyphHeight * 0.05);
  const minX = input.glyphWidth / 2 + horizontalPadding;
  const maxX = WIDTH - input.glyphWidth / 2 - horizontalPadding;
  const minY = input.glyphHeight / 2 + verticalPadding;
  const maxY = HEIGHT - input.glyphHeight / 2 - verticalPadding;
  return {
    x: maxX > minX ? minX + seededUnit(input.seed, 'placement-x') * (maxX - minX) : WIDTH / 2,
    y: maxY > minY ? minY + seededUnit(input.seed, 'placement-y') * (maxY - minY) : HEIGHT / 2,
  };
}

export function maskForLetter(letter: string, variantIndex: number): Uint8Array {
  const seed = variantSeed(letter, variantIndex);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('preview_canvas_missing');

  const style = letterMaskStyle(letter);
  const source = cropGlyphMask(glyphMask(letter, seed));
  const targetHeight = Math.round(HEIGHT * GLYPH_HEIGHT_RATIO * style.fontSizeScale * style.scaleY);
  const targetWidth = Math.round(targetHeight * (source.width / source.height) * style.scaleX);
  const center = seededCenterWithinBounds({
    seed,
    glyphWidth: targetWidth,
    glyphHeight: targetHeight,
  });
  const left = Math.round(center.x - targetWidth / 2);
  const top = Math.round(center.y - targetHeight / 2);

  context.fillStyle = '#000';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(glyphCanvas(source), left, top, targetWidth, targetHeight);
  if (letter.toUpperCase() === 'J') {
    drawJSerifAndHook({
      context,
      left,
      top,
      width: targetWidth,
      height: targetHeight,
    });
  }

  const rgba = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const mask = new Uint8Array(WIDTH * HEIGHT);
  for (let index = 0; index < mask.length; index += 1) mask[index] = rgba[index * 4] ?? 0;
  return mask;
}

/* jscpd:ignore-end */
