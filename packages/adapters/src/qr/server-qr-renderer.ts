import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';

const QR_SCALE = 16;
const QUIET_MODULES = 2;
const POISON_RATIO = 0.18;
const FRAME_MS = 180;
const WRONG_RATES = [0.005, 0.2, 0.01, 0.25] as const;

interface QrModules {
  size: number;
  get(x: number, y: number): number;
}

export interface RenderedQrFrames {
  frames: Uint8Array[];
  frameMs: number;
  frameCount: number;
  width: number;
}

function isFunctionModule(row: number, column: number, moduleCount: number): boolean {
  if (row < 9 && column < 9) return true;
  if (row < 9 && column >= moduleCount - 8) return true;
  if (row >= moduleCount - 8 && column < 9) return true;
  if (row === 6 || column === 6) return true;
  const alignment = moduleCount - 7;
  return moduleCount >= 25 && Math.abs(row - alignment) <= 3 && Math.abs(column - alignment) <= 3;
}

function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function moduleIndex(modules: QrModules, row: number, column: number): number {
  return row * modules.size + column;
}

function buildFlipMask(modules: QrModules, wrongRate: number, seed: string): Uint8Array {
  const mask = new Uint8Array(modules.size * modules.size);
  const random = seededRandom(seed);
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (!isFunctionModule(row, column, modules.size)) {
        mask[moduleIndex(modules, row, column)] = random() < wrongRate ? 1 : 0;
      }
    }
  }
  return mask;
}

function displayedDark(modules: QrModules, row: number, column: number, mask: Uint8Array): boolean {
  const original = modules.get(column, row) === 1;
  if (isFunctionModule(row, column, modules.size)) return original;
  return mask[moduleIndex(modules, row, column)] === 1 ? !original : original;
}

function fillRectangle(
  png: PNG,
  xStart: number,
  yStart: number,
  width: number,
  dark: boolean
): void {
  const value = dark ? 0 : 255;
  for (let y = yStart; y < yStart + width; y += 1) {
    for (let x = xStart; x < xStart + width; x += 1) {
      const offset = (y * png.width + x) * 4;
      png.data[offset] = value;
      png.data[offset + 1] = value;
      png.data[offset + 2] = value;
      png.data[offset + 3] = 255;
    }
  }
}

function paintModules(png: PNG, modules: QrModules, mask: Uint8Array): void {
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (displayedDark(modules, row, column, mask)) {
        fillRectangle(
          png,
          (column + QUIET_MODULES) * QR_SCALE,
          (row + QUIET_MODULES) * QR_SCALE,
          QR_SCALE,
          true
        );
      }
    }
  }
}

function paintPoisonCenters(png: PNG, modules: QrModules, mask: Uint8Array): void {
  const width = Math.round(QR_SCALE * POISON_RATIO);
  const offset = Math.round((QR_SCALE - width) / 2);
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (isFunctionModule(row, column, modules.size)) continue;
      fillRectangle(
        png,
        (column + QUIET_MODULES) * QR_SCALE + offset,
        (row + QUIET_MODULES) * QR_SCALE + offset,
        width,
        !displayedDark(modules, row, column, mask)
      );
    }
  }
}

function renderFrame(modules: QrModules, wrongRate: number, seed: string): Uint8Array {
  const width = (modules.size + QUIET_MODULES * 2) * QR_SCALE;
  const png = new PNG({ width, height: width });
  png.data.fill(255);
  const mask = buildFlipMask(modules, wrongRate, seed);
  paintModules(png, modules, mask);
  paintPoisonCenters(png, modules, mask);
  return PNG.sync.write(png);
}

export async function renderPairQrFrames(
  pairOrigin: string,
  token: string,
  suffix = ''
): Promise<RenderedQrFrames> {
  const url = `${pairOrigin}/p/${token}${suffix}`;
  const modules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const frames = WRONG_RATES.map((rate, index) => renderFrame(modules, rate, `${token}:${index}`));
  return {
    frames,
    frameMs: FRAME_MS,
    frameCount: frames.length,
    width: (modules.size + QUIET_MODULES * 2) * QR_SCALE,
  };
}
