import sharp from 'sharp';

interface InkBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export function pixelBrightness(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isSignalHue(r: number, g: number, b: number): boolean {
  return b >= 220 && r >= 130 && g >= 100;
}

export function pixelDiffers(pixels: Buffer, baseline: Buffer, offset: number): boolean {
  return (
    pixels[offset] !== baseline[offset] ||
    pixels[offset + 1] !== baseline[offset + 1] ||
    pixels[offset + 2] !== baseline[offset + 2]
  );
}

export function signalGeometry(pixels: Buffer, width: number, height: number, baseline?: Buffer) {
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 3;
    if (baseline && !pixelDiffers(pixels, baseline, offset)) continue;
    if (!isSignalHue(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0)) {
      continue;
    }
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    count += 1;
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    count,
    minX,
    minY,
    maxX,
    maxY,
    centerX: sumX / Math.max(1, count),
    centerY: sumY / Math.max(1, count),
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function isBackgroundHue(r: number, g: number, b: number): boolean {
  return Math.max(r, g, b) < 32 && g > r && g > b;
}

export function inkBounds(mask: Uint8Array, width: number, height: number): InkBounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[y * width + x] ?? 0) <= 128) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) {
    return {
      minX: 0,
      minY: 0,
      maxX: -1,
      maxY: -1,
      centerX: width / 2,
      centerY: height / 2,
      width: 0,
      height: 0,
    };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX + 1) / 2,
    centerY: (minY + maxY + 1) / 2,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function countInkInRect(input: {
  mask: Uint8Array;
  width: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}): number {
  let ink = 0;
  for (let y = input.y0; y < input.y1; y += 1) {
    for (let x = input.x0; x < input.x1; x += 1) {
      if ((input.mask[y * input.width + x] ?? 0) > 128) ink += 1;
    }
  }
  return ink;
}

export async function rawPngPixels(picture: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(picture)).raw().toBuffer();
}
