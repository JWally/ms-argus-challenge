import {
  catalogKey,
  frameCacheKey,
  maskCacheKey,
  renderDotFrame,
  variantSeed,
} from './dot-frame.js';
import { renderBioDotPngFrame } from './bio-dot-frame.js';
import {
  DRAWING_PICTURE_ALPHABET,
  normalizePrompt,
  rendererConfig,
  roundMilliseconds,
  type RendererConfig,
} from './picture-renderer-config.js';
import type {
  BuildDrawingPictureCatalogOptions,
  DrawingPictureCatalog,
  DrawingPicturePrompt,
  RenderedDrawingPictures,
  RenderServerDrawingPicturesOptions,
} from './picture-renderer-types.js';
import { seededUnit } from './renderer-random.js';

export type {
  BuildDrawingPictureCatalogOptions,
  DrawingPictureCatalog,
  DrawingPictureEncoding,
  DrawingPicturePrompt,
  DrawingPictureRenderProfile,
  RenderedDrawingPictures,
  RenderServerDrawingPicturesOptions,
} from './picture-renderer-types.js';
export {
  DEFAULT_DRAWING_PICTURE_FRAME_MS,
  DEFAULT_DRAWING_PICTURE_FRAMES,
  DEFAULT_DRAWING_PICTURE_VARIANTS,
  DRAWING_PICTURE_ALPHABET,
} from './picture-renderer-config.js';
export type { RenderDrawingMaskInput } from './svg-mask.js';

function variantIndexForSeed(seed: string, variantCount: number): number {
  return Math.floor(seededUnit(seed, 'variant') * variantCount);
}

function assertMaskDimensions(mask: Uint8Array, width: number, height: number): void {
  if (mask.byteLength !== width * height) throw new Error('invalid_drawing_picture_bytes');
}

async function sourceMask(
  config: RendererConfig,
  letter: string,
  variantIndex: number
): Promise<Uint8Array> {
  const key = maskCacheKey(config.width, config.height, letter, variantIndex);
  const cached = config.maskCache.get(key);
  if (cached) return cached;
  const rendered = await config.renderMask({
    letter,
    seed: variantSeed(letter, variantIndex),
    width: config.width,
    height: config.height,
  });
  assertMaskDimensions(rendered, config.width, config.height);
  config.maskCache.set(key, Uint8Array.from(rendered));
  return rendered;
}

async function framePicture(input: {
  config: RendererConfig;
  letter: string;
  variantIndex: number;
  frameIndex: number;
  mask?: Uint8Array;
}): Promise<{ picture: Uint8Array; cacheHit: boolean }> {
  const { config, letter, variantIndex, frameIndex } = input;
  const catalogPicture = config.catalog?.pictures.get(catalogKey(letter, variantIndex, frameIndex));
  if (catalogPicture) return { picture: Uint8Array.from(catalogPicture), cacheHit: true };
  if (config.catalog) throw new Error('drawing_picture_catalog_missing_variant');

  const key = frameCacheKey({
    encoding: config.encoding,
    width: config.width,
    height: config.height,
    letter,
    variantIndex,
    frameIndex,
    framesPerPrompt: config.framesPerPrompt,
  });
  const cached = config.cache.get(key);
  if (cached) return { picture: Uint8Array.from(cached), cacheHit: true };

  const mask = input.mask ?? (await sourceMask(config, letter, variantIndex));
  const renderInput = {
    letter,
    variantIndex,
    frameIndex,
    framesPerPrompt: config.framesPerPrompt,
    mask,
    width: config.width,
    height: config.height,
  };
  const picture =
    config.encoding === 'png'
      ? await renderBioDotPngFrame(renderInput)
      : renderDotFrame(renderInput);
  config.cache.set(key, Uint8Array.from(picture));
  return { picture, cacheHit: false };
}

async function promptFrames(
  prompt: DrawingPicturePrompt,
  config: RendererConfig
): Promise<Array<{ picture: Uint8Array; cacheHit: boolean }>> {
  const normalized = normalizePrompt(prompt);
  const variantIndex = variantIndexForSeed(normalized.seed, config.variantCount);
  const mask = config.catalog
    ? undefined
    : await sourceMask(config, normalized.letter, variantIndex);
  return Promise.all(
    Array.from({ length: config.framesPerPrompt }, (_, frameIndex) =>
      framePicture({
        config,
        letter: normalized.letter,
        variantIndex,
        frameIndex,
        ...(mask ? { mask } : {}),
      })
    )
  );
}

export async function buildDrawingPictureCatalog(
  options: BuildDrawingPictureCatalogOptions = {}
): Promise<DrawingPictureCatalog> {
  const config = rendererConfig({ ...options, cache: new Map(), maskCache: new Map() });
  const pictures = new Map<string, Uint8Array>();
  for (const letter of DRAWING_PICTURE_ALPHABET) {
    for (let variantIndex = 0; variantIndex < config.variantCount; variantIndex += 1) {
      const mask = await sourceMask(config, letter, variantIndex);
      for (let frameIndex = 0; frameIndex < config.framesPerPrompt; frameIndex += 1) {
        const input = {
          letter,
          variantIndex,
          frameIndex,
          framesPerPrompt: config.framesPerPrompt,
          mask,
          width: config.width,
          height: config.height,
        };
        pictures.set(
          catalogKey(letter, variantIndex, frameIndex),
          config.encoding === 'png' ? await renderBioDotPngFrame(input) : renderDotFrame(input)
        );
      }
    }
  }
  return {
    encoding: config.encoding,
    width: config.width,
    height: config.height,
    variantCount: config.variantCount,
    framesPerPrompt: config.framesPerPrompt,
    frameMs: config.frameMs,
    pictures,
  };
}

export function renderServerDrawingPictures(
  options: RenderServerDrawingPicturesOptions = {}
): (prompts: DrawingPicturePrompt[]) => Promise<RenderedDrawingPictures> {
  const config = rendererConfig(options);
  return async (prompts) => {
    if (prompts.length < 1 || prompts.length * config.framesPerPrompt > 255) {
      throw new Error('invalid_drawing_picture_count');
    }
    const startedAt = config.nowMilliseconds();
    let cacheHits = 0;
    const pictures: Uint8Array[] = [];
    for (const prompt of prompts) {
      for (const frame of await promptFrames(prompt, config)) {
        if (frame.cacheHit) cacheHits += 1;
        pictures.push(frame.picture);
      }
    }
    return {
      encoding: config.encoding,
      width: config.width,
      height: config.height,
      framesPerPrompt: config.framesPerPrompt,
      frameMs: config.frameMs,
      pictures,
      profile: {
        pictureCount: pictures.length,
        width: config.width,
        height: config.height,
        framesPerPrompt: config.framesPerPrompt,
        frameMs: config.frameMs,
        encoding: config.encoding,
        cacheHits,
        cacheMisses: pictures.length - cacheHits,
        totalBytes: pictures.reduce((total, picture) => total + picture.byteLength, 0),
        totalMs: roundMilliseconds(config.nowMilliseconds() - startedAt),
      },
    };
  };
}
