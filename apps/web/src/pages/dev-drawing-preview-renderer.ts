import {
  BIO_PICTURE_BACKGROUND,
  bioPictureDotAppearance,
  buildBioPictureDots,
} from '../../../../packages/contracts/src/drawing/bio-picture-style.js';
import { buildBioPictureSnow } from '../../../../packages/contracts/src/drawing/bio-picture-snow.js';
import { FRAMES_PER_PROMPT, HEIGHT, WIDTH, seededUnit } from './dev-drawing-preview-model.js';
import { maskForLetter } from './dev-drawing-preview-glyph-mask.js';

function maskAt(mask: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return false;
  return (mask[Math.floor(y) * WIDTH + Math.floor(x)] ?? 0) > 128;
}

function roundedRectPath(input: {
  context: CanvasRenderingContext2D;
  centerX: number;
  centerY: number;
  size: number;
  radius: number;
}): void {
  const left = input.centerX - input.size / 2;
  const top = input.centerY - input.size / 2;
  input.context.beginPath();
  input.context.roundRect(left, top, input.size, input.size, input.radius);
}

async function pngBytesFromCanvas(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('preview_png_encode_failed'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function renderFrame(input: {
  letter: string;
  variantIndex: number;
  frameIndex: number;
  mask: Uint8Array;
}): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('preview_canvas_missing');
  context.fillStyle = BIO_PICTURE_BACKGROUND;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const picture = {
    letter: input.letter,
    variantIndex: input.variantIndex,
    frameIndex: input.frameIndex,
    width: WIDTH,
    height: HEIGHT,
  };
  for (const speck of buildBioPictureSnow(picture)) {
    context.fillStyle = speck.color;
    roundedRectPath({
      context,
      centerX: speck.x + speck.width / 2,
      centerY: speck.y + speck.height / 2,
      size: speck.width,
      radius: speck.radius,
    });
    context.fill();
  }
  const dots = buildBioPictureDots({
    ...picture,
    framesPerPrompt: FRAMES_PER_PROMPT,
    sampleLetter: (x, y) => maskAt(input.mask, x, y),
  });
  for (const dot of dots) {
    const appearance = bioPictureDotAppearance({ dot });
    if (!appearance) continue;
    context.fillStyle = appearance.color;
    roundedRectPath({
      context,
      centerX: appearance.centerX,
      centerY: appearance.centerY,
      size: appearance.size,
      radius: appearance.radius,
    });
    context.fill();
  }
  return pngBytesFromCanvas(canvas);
}

export async function framesForLetter(letter: string, previewSeed: string): Promise<Uint8Array[]> {
  const variantIndex = Math.floor(seededUnit(`${previewSeed}:${letter}`, 'variant') * 20);
  const mask = maskForLetter(letter, variantIndex);
  return Promise.all(
    Array.from({ length: FRAMES_PER_PROMPT }, (_, frameIndex) =>
      renderFrame({ letter, variantIndex, frameIndex, mask })
    )
  );
}
