import sharp from 'sharp';
// cspell:ignore lanczos
import {
  GLYPH_MASK_HEIGHT,
  GLYPH_MASK_WIDTH,
  GLYPH_VARIANTS,
} from '../../../contracts/src/drawing/glyph-masks.js';
import { GLYPH_VARIANT_INDEXES } from '../../../contracts/src/drawing/glyph-mask-selection.js';
import { drawingPictureLetterMaskStyle } from './picture-readability.js';
import { seededUnit } from './renderer-random.js';

const GLYPH_HEIGHT_RATIO = 0.76;

export interface RenderDrawingMaskInput {
  letter: string;
  seed: string;
  width: number;
  height: number;
}

function glyphVariants(letter: string): string[] {
  const normalized = letter.toUpperCase();
  const key = GLYPH_VARIANT_INDEXES[normalized] ? normalized : 'A';
  const variants = GLYPH_VARIANTS[key] ?? [];
  return (GLYPH_VARIANT_INDEXES[key] ?? []).map((index) => variants[index]!).filter(Boolean);
}

function glyphMask(input: RenderDrawingMaskInput): Uint8Array {
  const variants = glyphVariants(input.letter);
  const encoded = variants[Math.floor(seededUnit(input.seed, 'glyph-variant') * variants.length)];
  if (!encoded) throw new Error('unsupported_drawing_picture_letter');
  const packed = Buffer.from(encoded, 'base64');
  const mask = new Uint8Array(GLYPH_MASK_WIDTH * GLYPH_MASK_HEIGHT);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = (packed[Math.floor(index / 8)] ?? 0) & (1 << (7 - (index % 8))) ? 255 : 0;
  }
  return mask;
}

function cropGlyphMask(mask: Uint8Array): { data: Uint8Array; width: number; height: number } {
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
  if (maxX < minX || maxY < minY) {
    return { data: mask, width: GLYPH_MASK_WIDTH, height: GLYPH_MASK_HEIGHT };
  }

  const pad = 2;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(GLYPH_MASK_WIDTH - 1, maxX + pad);
  const bottom = Math.min(GLYPH_MASK_HEIGHT - 1, maxY + pad);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = mask[(top + y) * GLYPH_MASK_WIDTH + left + x] ?? 0;
    }
  }
  return { data, width, height };
}

async function resizeGlyphMask(
  input: RenderDrawingMaskInput
): Promise<{ data: Buffer; width: number; height: number }> {
  const style = drawingPictureLetterMaskStyle(input.letter);
  const source = cropGlyphMask(glyphMask(input));
  const targetHeight = Math.round(
    input.height * GLYPH_HEIGHT_RATIO * style.fontSizeScale * style.scaleY
  );
  const targetWidth = Math.round(targetHeight * (source.width / source.height) * style.scaleX);
  const { data, info } = await sharp(source.data, {
    raw: { width: source.width, height: source.height, channels: 1 },
  })
    .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .threshold(64)
    .dilate(2)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function seededCenterWithinBounds(input: {
  seed: string;
  width: number;
  height: number;
  glyphWidth: number;
  glyphHeight: number;
}): { x: number; y: number } {
  const horizontalPadding = Math.max(4, input.glyphWidth * 0.05);
  const verticalPadding = Math.max(4, input.glyphHeight * 0.05);
  const minX = input.glyphWidth / 2 + horizontalPadding;
  const maxX = input.width - input.glyphWidth / 2 - horizontalPadding;
  const minY = input.glyphHeight / 2 + verticalPadding;
  const maxY = input.height - input.glyphHeight / 2 - verticalPadding;
  return {
    x: maxX > minX ? minX + seededUnit(input.seed, 'placement-x') * (maxX - minX) : input.width / 2,
    y:
      maxY > minY ? minY + seededUnit(input.seed, 'placement-y') * (maxY - minY) : input.height / 2,
  };
}

function fillMaskCircle(input: {
  output: Buffer;
  width: number;
  height: number;
  x: number;
  y: number;
  radius: number;
}): void {
  const left = Math.max(0, Math.floor(input.x - input.radius));
  const right = Math.min(input.width - 1, Math.ceil(input.x + input.radius));
  const top = Math.max(0, Math.floor(input.y - input.radius));
  const bottom = Math.min(input.height - 1, Math.ceil(input.y + input.radius));
  for (let pixelY = top; pixelY <= bottom; pixelY += 1) {
    for (let pixelX = left; pixelX <= right; pixelX += 1) {
      if (Math.hypot(pixelX + 0.5 - input.x, pixelY + 0.5 - input.y) > input.radius) continue;
      input.output[pixelY * input.width + pixelX] = 255;
    }
  }
}

function drawMaskSegment(input: {
  output: Buffer;
  width: number;
  height: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  radius: number;
}): void {
  const distance = Math.hypot(input.to.x - input.from.x, input.to.y - input.from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, input.radius * 0.65)));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    fillMaskCircle({
      output: input.output,
      width: input.width,
      height: input.height,
      x: input.from.x + (input.to.x - input.from.x) * progress,
      y: input.from.y + (input.to.y - input.from.y) * progress,
      radius: input.radius,
    });
  }
}

function augmentJMask(input: {
  output: Buffer;
  width: number;
  height: number;
  left: number;
  top: number;
  glyphWidth: number;
  glyphHeight: number;
}): void {
  const radius = Math.max(2, Math.round(input.glyphHeight * 0.045));
  const topY = input.top + input.glyphHeight * 0.08;
  const serifLeft = input.left + input.glyphWidth * 0.28;
  const serifRight = input.left + input.glyphWidth * 0.72;
  drawMaskSegment({
    output: input.output,
    width: input.width,
    height: input.height,
    from: { x: serifLeft, y: topY },
    to: { x: serifRight, y: topY },
    radius,
  });

  const hook = [
    { x: input.left + input.glyphWidth * 0.58, y: input.top + input.glyphHeight * 0.74 },
    { x: input.left + input.glyphWidth * 0.56, y: input.top + input.glyphHeight * 0.9 },
    { x: input.left + input.glyphWidth * 0.42, y: input.top + input.glyphHeight * 0.99 },
    { x: input.left + input.glyphWidth * 0.24, y: input.top + input.glyphHeight * 0.92 },
  ];
  for (let index = 1; index < hook.length; index += 1) {
    drawMaskSegment({
      output: input.output,
      width: input.width,
      height: input.height,
      from: hook[index - 1]!,
      to: hook[index]!,
      radius,
    });
  }
}

export async function renderSvgMask(input: RenderDrawingMaskInput): Promise<Uint8Array> {
  const glyph = await resizeGlyphMask(input);
  const output = Buffer.alloc(input.width * input.height);
  const center = seededCenterWithinBounds({
    seed: input.seed,
    width: input.width,
    height: input.height,
    glyphWidth: glyph.width,
    glyphHeight: glyph.height,
  });
  const left = Math.round(center.x - glyph.width / 2);
  const top = Math.round(center.y - glyph.height / 2);
  for (let y = 0; y < glyph.height; y += 1) {
    const targetY = top + y;
    if (targetY < 0 || targetY >= input.height) continue;
    for (let x = 0; x < glyph.width; x += 1) {
      const targetX = left + x;
      if (targetX < 0 || targetX >= input.width) continue;
      output[targetY * input.width + targetX] = glyph.data[y * glyph.width + x] ?? 0;
    }
  }
  if (input.letter.toUpperCase() === 'J') {
    augmentJMask({
      output,
      width: input.width,
      height: input.height,
      left,
      top,
      glyphWidth: glyph.width,
      glyphHeight: glyph.height,
    });
  }
  return new Uint8Array(output);
}
