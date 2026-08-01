import type {
  DrawingPictureCatalog,
  DrawingPictureEncoding,
  DrawingPicturePrompt,
} from './picture-renderer-types.js';
import { renderSvgMask, type RenderDrawingMaskInput } from './svg-mask.js';

export const DRAWING_PICTURE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const DEFAULT_DRAWING_PICTURE_VARIANTS = 20;
export const DEFAULT_DRAWING_PICTURE_FRAMES = 4;
export const DEFAULT_DRAWING_PICTURE_FRAME_MS = 60;

const DEFAULT_ENCODING: DrawingPictureEncoding = 'png';
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 270;

export interface RendererConfig {
  width: number;
  height: number;
  variantCount: number;
  framesPerPrompt: number;
  frameMs: number;
  encoding: DrawingPictureEncoding;
  cache: Map<string, Uint8Array>;
  maskCache: Map<string, Uint8Array>;
  renderMask(input: RenderDrawingMaskInput): Promise<Uint8Array>;
  nowMilliseconds(): number;
  catalog?: DrawingPictureCatalog;
}

interface RenderServerDrawingPicturesOptions {
  encoding?: DrawingPictureEncoding;
  width?: number;
  height?: number;
  variantCount?: number;
  framesPerPrompt?: number;
  frameMs?: number;
  cache?: Map<string, Uint8Array>;
  maskCache?: Map<string, Uint8Array>;
  renderMask?: (input: RenderDrawingMaskInput) => Promise<Uint8Array>;
  nowMilliseconds?: () => number;
  catalog?: DrawingPictureCatalog;
}

const defaultFrameCache = new Map<string, Uint8Array>();
const defaultMaskCache = new Map<string, Uint8Array>();

function nowMilliseconds(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

export function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertDimension(name: 'width' | 'height', value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 1_024) {
    throw new Error(`invalid_drawing_picture_${name}`);
  }
}

function assertSmallCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 255) {
    throw new Error(`invalid_drawing_picture_${name}`);
  }
}

function assertEncoding(value: DrawingPictureEncoding): void {
  if (value !== 'gray8' && value !== 'png') throw new Error('invalid_drawing_picture_encoding');
}

function normalizeSeed(seed: string | number): string {
  if (typeof seed === 'number') {
    if (!Number.isSafeInteger(seed)) throw new Error('invalid_drawing_picture_seed');
    return String(seed);
  }
  if (seed.length < 1 || seed.length > 256) throw new Error('invalid_drawing_picture_seed');
  return seed;
}

export function normalizePrompt(
  prompt: DrawingPicturePrompt
): Pick<RenderDrawingMaskInput, 'letter' | 'seed'> {
  const letter = prompt.letter.toUpperCase();
  if (letter.length !== 1 || !DRAWING_PICTURE_ALPHABET.includes(letter)) {
    throw new Error('invalid_drawing_picture_letter');
  }
  return { letter, seed: normalizeSeed(prompt.seed) };
}

function assertCatalogFits(
  catalog: DrawingPictureCatalog | undefined,
  config: RendererConfig
): void {
  if (!catalog) return;
  if (catalog.width !== config.width) throw new Error('drawing_picture_catalog_width_mismatch');
  if (catalog.height !== config.height) throw new Error('drawing_picture_catalog_height_mismatch');
  if (catalog.variantCount !== config.variantCount) {
    throw new Error('drawing_picture_catalog_variant_mismatch');
  }
  if (catalog.encoding !== config.encoding) {
    throw new Error('drawing_picture_catalog_encoding_mismatch');
  }
  if (catalog.framesPerPrompt !== config.framesPerPrompt) {
    throw new Error('drawing_picture_catalog_frames_mismatch');
  }
  if (catalog.frameMs !== config.frameMs)
    throw new Error('drawing_picture_catalog_frame_ms_mismatch');
}

function configuredValue<T>(explicit: T | undefined, catalog: T | undefined, fallback: T): T {
  if (explicit !== undefined) return explicit;
  if (catalog !== undefined) return catalog;
  return fallback;
}

function attachCatalog(
  config: Omit<RendererConfig, 'catalog'>,
  catalog: DrawingPictureCatalog | undefined
): RendererConfig {
  return catalog ? { ...config, catalog } : config;
}

export function rendererConfig(options: RenderServerDrawingPicturesOptions): RendererConfig {
  const config = {
    width: configuredValue(options.width, options.catalog?.width, DEFAULT_WIDTH),
    height: configuredValue(options.height, options.catalog?.height, DEFAULT_HEIGHT),
    variantCount: configuredValue(
      options.variantCount,
      options.catalog?.variantCount,
      DEFAULT_DRAWING_PICTURE_VARIANTS
    ),
    framesPerPrompt: configuredValue(
      options.framesPerPrompt,
      options.catalog?.framesPerPrompt,
      DEFAULT_DRAWING_PICTURE_FRAMES
    ),
    frameMs: configuredValue(
      options.frameMs,
      options.catalog?.frameMs,
      DEFAULT_DRAWING_PICTURE_FRAME_MS
    ),
    encoding: configuredValue(options.encoding, options.catalog?.encoding, DEFAULT_ENCODING),
    cache: options.cache ?? defaultFrameCache,
    maskCache: options.maskCache ?? defaultMaskCache,
    renderMask: options.renderMask ?? renderSvgMask,
    nowMilliseconds: options.nowMilliseconds ?? nowMilliseconds,
  };
  assertDimension('width', config.width);
  assertDimension('height', config.height);
  assertSmallCount('variant_count', config.variantCount);
  assertSmallCount('frames_per_prompt', config.framesPerPrompt);
  assertSmallCount('frame_ms', config.frameMs);
  assertEncoding(config.encoding);
  assertCatalogFits(options.catalog, config);
  return attachCatalog(config, options.catalog);
}
