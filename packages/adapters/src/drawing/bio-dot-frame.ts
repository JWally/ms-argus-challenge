import sharp from 'sharp';
import {
  BIO_PICTURE_BACKGROUND,
  bioPictureDotAppearance,
  buildBioPictureDots,
} from '../../../contracts/src/drawing/bio-picture-style.js';
import { buildBioPictureSnow } from '../../../contracts/src/drawing/bio-picture-snow.js';
import { rgb, type Rgb } from './bio-dot-raster.js';
const BACKGROUND_RGB = rgb(BIO_PICTURE_BACKGROUND);

interface BioDotFrameInput {
  letter: string;
  variantIndex: number;
  frameIndex: number;
  framesPerPrompt: number;
  mask: Uint8Array;
  width: number;
  height: number;
}

function setPixel(output: Uint8Array, width: number, x: number, y: number, color: Rgb): void {
  const offset = (y * width + x) * 3;
  output[offset] = color.r;
  output[offset + 1] = color.g;
  output[offset + 2] = color.b;
}

function fillBackground(output: Uint8Array): void {
  for (let offset = 0; offset < output.byteLength; offset += 3) {
    output[offset] = BACKGROUND_RGB.r;
    output[offset + 1] = BACKGROUND_RGB.g;
    output[offset + 2] = BACKGROUND_RGB.b;
  }
}

function maskAt(input: BioDotFrameInput, x: number, y: number): boolean {
  if (x < 0 || x >= input.width || y < 0 || y >= input.height) return false;
  return (input.mask[Math.floor(y) * input.width + Math.floor(x)] ?? 0) > 128;
}

function roundedRectContains(input: {
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  radius: number;
}): boolean {
  const innerLeft = input.left + input.radius;
  const innerRight = input.right - input.radius;
  const innerTop = input.top + input.radius;
  const innerBottom = input.bottom - input.radius;
  if (input.x >= innerLeft && input.x <= innerRight) return true;
  if (input.y >= innerTop && input.y <= innerBottom) return true;
  const centerX = input.x < innerLeft ? innerLeft : innerRight;
  const centerY = input.y < innerTop ? innerTop : innerBottom;
  return Math.hypot(input.x - centerX, input.y - centerY) <= input.radius;
}

function fillRoundedSquare(input: {
  output: Uint8Array;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  size: number;
  radius: number;
  color: Rgb;
}): void {
  const left = input.centerX - input.size / 2;
  const top = input.centerY - input.size / 2;
  const right = input.centerX + input.size / 2;
  const bottom = input.centerY + input.size / 2;
  const minX = Math.max(0, Math.floor(left));
  const maxX = Math.min(input.width - 1, Math.ceil(right));
  const minY = Math.max(0, Math.floor(top));
  const maxY = Math.min(input.height - 1, Math.ceil(bottom));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (
        !roundedRectContains({
          x: x + 0.5,
          y: y + 0.5,
          left,
          top,
          right,
          bottom,
          radius: input.radius,
        })
      ) {
        continue;
      }
      setPixel(input.output, input.width, x, y, input.color);
    }
  }
}

function renderRgbFrame(input: BioDotFrameInput): Uint8Array {
  const output = new Uint8Array(input.width * input.height * 3);
  fillBackground(output);
  const snow = buildBioPictureSnow(input);
  for (const speck of snow) {
    fillRoundedSquare({
      output,
      width: input.width,
      height: input.height,
      centerX: speck.x + speck.width / 2,
      centerY: speck.y + speck.height / 2,
      size: speck.width,
      radius: speck.radius,
      color: rgb(speck.color),
    });
  }
  const dots = buildBioPictureDots({
    letter: input.letter,
    variantIndex: input.variantIndex,
    frameIndex: input.frameIndex,
    framesPerPrompt: input.framesPerPrompt,
    width: input.width,
    height: input.height,
    sampleLetter: (x, y) => maskAt(input, x, y),
  });
  for (const dot of dots) {
    const appearance = bioPictureDotAppearance({
      dot,
    });
    fillRoundedSquare({
      output,
      width: input.width,
      height: input.height,
      centerX: dot.x,
      centerY: dot.y,
      size: appearance.size,
      radius: appearance.radius,
      color: rgb(appearance.color),
    });
  }
  return output;
}

export async function renderBioDotPngFrame(input: BioDotFrameInput): Promise<Uint8Array> {
  const pixels = renderRgbFrame(input);
  const buffer = await sharp(pixels, {
    raw: { width: input.width, height: input.height, channels: 3 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return new Uint8Array(buffer);
}
