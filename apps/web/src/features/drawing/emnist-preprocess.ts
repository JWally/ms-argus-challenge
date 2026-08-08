import { EMNIST_INPUT_PIXELS, EMNIST_INPUT_SIDE } from './emnist-inference.js';

interface InkBounds {
  minimumX: number;
  minimumY: number;
  maximumX: number;
  maximumY: number;
}

function findInkBounds(image: ImageData): InkBounds | null {
  const bounds: InkBounds = {
    minimumX: image.width,
    minimumY: image.height,
    maximumX: -1,
    maximumY: -1,
  };
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4] ?? 0) <= 60) continue;
      bounds.minimumX = Math.min(bounds.minimumX, x);
      bounds.minimumY = Math.min(bounds.minimumY, y);
      bounds.maximumX = Math.max(bounds.maximumX, x);
      bounds.maximumY = Math.max(bounds.maximumY, y);
    }
  }
  return bounds.maximumX < 0 ? null : bounds;
}

function redAt(image: ImageData, x: number, y: number): number {
  const safeX = Math.max(0, Math.min(image.width - 1, x));
  const safeY = Math.max(0, Math.min(image.height - 1, y));
  return (image.data[(safeY * image.width + safeX) * 4] ?? 0) / 255;
}

function bilinearRed(image: ImageData, x: number, y: number): number {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const horizontal = x - left;
  const vertical = y - top;
  const upper =
    redAt(image, left, top) * (1 - horizontal) + redAt(image, left + 1, top) * horizontal;
  const lower =
    redAt(image, left, top + 1) * (1 - horizontal) + redAt(image, left + 1, top + 1) * horizontal;
  return upper * (1 - vertical) + lower * vertical;
}

function centerMass(raster: Float32Array): Float32Array {
  let mass = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < EMNIST_INPUT_SIDE; y += 1) {
    for (let x = 0; x < EMNIST_INPUT_SIDE; x += 1) {
      const value = raster[y * EMNIST_INPUT_SIDE + x] ?? 0;
      mass += value;
      weightedX += x * value;
      weightedY += y * value;
    }
  }
  if (mass === 0) return raster;
  const shiftX = Math.round(14 - weightedX / mass);
  const shiftY = Math.round(14 - weightedY / mass);
  const centered = new Float32Array(EMNIST_INPUT_PIXELS);
  for (let y = 0; y < EMNIST_INPUT_SIDE; y += 1) {
    for (let x = 0; x < EMNIST_INPUT_SIDE; x += 1) {
      const nextX = x + shiftX;
      const nextY = y + shiftY;
      if (nextX < 0 || nextX >= 28 || nextY < 0 || nextY >= 28) continue;
      centered[nextY * EMNIST_INPUT_SIDE + nextX] = raster[y * EMNIST_INPUT_SIDE + x] ?? 0;
    }
  }
  return centered;
}

export function normalizeDrawingImage(image: ImageData): Float32Array {
  const bounds = findInkBounds(image);
  if (!bounds) return new Float32Array(EMNIST_INPUT_PIXELS);
  const sourceWidth = bounds.maximumX - bounds.minimumX + 1;
  const sourceHeight = bounds.maximumY - bounds.minimumY + 1;
  const scale = 20 / Math.max(sourceWidth, sourceHeight);
  const drawnWidth = Math.max(1, sourceWidth * scale);
  const drawnHeight = Math.max(1, sourceHeight * scale);
  const left = (EMNIST_INPUT_SIDE - drawnWidth) / 2;
  const top = (EMNIST_INPUT_SIDE - drawnHeight) / 2;
  const raster = new Float32Array(EMNIST_INPUT_PIXELS);
  for (let y = 0; y < EMNIST_INPUT_SIDE; y += 1) {
    for (let x = 0; x < EMNIST_INPUT_SIDE; x += 1) {
      if (x + 0.5 < left || x + 0.5 > left + drawnWidth) continue;
      if (y + 0.5 < top || y + 0.5 > top + drawnHeight) continue;
      const sourceX = bounds.minimumX + ((x + 0.5 - left) / drawnWidth) * sourceWidth - 0.5;
      const sourceY = bounds.minimumY + ((y + 0.5 - top) / drawnHeight) * sourceHeight - 0.5;
      raster[y * EMNIST_INPUT_SIDE + x] = bilinearRed(image, sourceX, sourceY);
    }
  }
  return centerMass(raster);
}
