import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';

const QR_SCALE = 16;
const QUIET_MODULES = 2;
const POISON_RATIO = 0.18;
const FRAME_MS = 180;
// Alternate scan-friendly frames with independently seeded high-noise frames.
export const QR_FRAME_CORRUPTION_RATES = [0.005, 0.15, 0.01, 0.15] as const;

interface QrModules {
  size: number;
  get(x: number, y: number): number;
}

export interface QrFrameProfile {
  maskMs: number;
  paintMs: number;
  encodeMs: number;
  totalMs: number;
  bytes: number;
}

export interface QrRenderProfile {
  createMs: number;
  totalMs: number;
  frames: QrFrameProfile[];
}

export interface RenderedQrFrames {
  frames: Uint8Array[];
  frameMs: number;
  frameCount: number;
  width: number;
  profile: QrRenderProfile;
}

export interface PngEncodeInput {
  pixels: Uint8Array;
  width: number;
}

interface QrRaster {
  pixels: Uint8Array;
  width: number;
}

export interface PairQrRendererDependencies {
  encodePng(input: PngEncodeInput): Promise<Uint8Array>;
  nowMilliseconds(): number;
}

function nowMilliseconds(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

async function encodePng({ pixels, width }: PngEncodeInput): Promise<Uint8Array> {
  return sharp(pixels, {
    raw: { width, height: width, channels: 4 },
  })
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer();
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
  raster: QrRaster,
  xStart: number,
  yStart: number,
  width: number,
  dark: boolean
): void {
  const value = dark ? 0 : 255;
  for (let y = yStart; y < yStart + width; y += 1) {
    for (let x = xStart; x < xStart + width; x += 1) {
      const offset = (y * raster.width + x) * 4;
      raster.pixels[offset] = value;
      raster.pixels[offset + 1] = value;
      raster.pixels[offset + 2] = value;
      raster.pixels[offset + 3] = 255;
    }
  }
}

function paintModules(raster: QrRaster, modules: QrModules, mask: Uint8Array): void {
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (displayedDark(modules, row, column, mask)) {
        fillRectangle(
          raster,
          (column + QUIET_MODULES) * QR_SCALE,
          (row + QUIET_MODULES) * QR_SCALE,
          QR_SCALE,
          true
        );
      }
    }
  }
}

function paintPoisonCenters(raster: QrRaster, modules: QrModules, mask: Uint8Array): void {
  const width = Math.round(QR_SCALE * POISON_RATIO);
  const offset = Math.round((QR_SCALE - width) / 2);
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (isFunctionModule(row, column, modules.size)) continue;
      fillRectangle(
        raster,
        (column + QUIET_MODULES) * QR_SCALE + offset,
        (row + QUIET_MODULES) * QR_SCALE + offset,
        width,
        !displayedDark(modules, row, column, mask)
      );
    }
  }
}

async function renderFrame(
  modules: QrModules,
  wrongRate: number,
  seed: string,
  dependencies: PairQrRendererDependencies
): Promise<{ png: Uint8Array; profile: QrFrameProfile }> {
  const startedAt = dependencies.nowMilliseconds();
  const width = (modules.size + QUIET_MODULES * 2) * QR_SCALE;
  const pixels = new Uint8Array(width * width * 4);
  const raster = { pixels, width };
  pixels.fill(255);
  const maskStartedAt = dependencies.nowMilliseconds();
  const mask = buildFlipMask(modules, wrongRate, seed);
  const maskMs = dependencies.nowMilliseconds() - maskStartedAt;
  const paintStartedAt = dependencies.nowMilliseconds();
  paintModules(raster, modules, mask);
  paintPoisonCenters(raster, modules, mask);
  const paintMs = dependencies.nowMilliseconds() - paintStartedAt;
  const encodeStartedAt = dependencies.nowMilliseconds();
  const png = await dependencies.encodePng({ pixels, width });
  const encodeMs = dependencies.nowMilliseconds() - encodeStartedAt;
  return {
    png,
    profile: {
      maskMs,
      paintMs,
      encodeMs,
      totalMs: dependencies.nowMilliseconds() - startedAt,
      bytes: png.byteLength,
    },
  };
}

export function createPairQrRenderer(
  overrides: Partial<PairQrRendererDependencies> = {}
): (pairOrigin: string, token: string, suffix?: string) => Promise<RenderedQrFrames> {
  const dependencies: PairQrRendererDependencies = {
    encodePng,
    nowMilliseconds,
    ...overrides,
  };
  return async (pairOrigin, token, suffix = '') => {
    const startedAt = dependencies.nowMilliseconds();
    const createStartedAt = dependencies.nowMilliseconds();
    const modules = QRCode.create(`${pairOrigin}/p/${token}${suffix}`, {
      errorCorrectionLevel: 'M',
    }).modules;
    const createMs = dependencies.nowMilliseconds() - createStartedAt;
    const rendered = await Promise.all(
      QR_FRAME_CORRUPTION_RATES.map((rate, index) =>
        renderFrame(modules, rate, `${token}:${index}`, dependencies)
      )
    );
    return {
      frames: rendered.map((frame) => frame.png),
      frameMs: FRAME_MS,
      frameCount: rendered.length,
      width: (modules.size + QUIET_MODULES * 2) * QR_SCALE,
      profile: {
        createMs,
        totalMs: dependencies.nowMilliseconds() - startedAt,
        frames: rendered.map((frame) => frame.profile),
      },
    };
  };
}

export const renderPairQrFrames = createPairQrRenderer();
