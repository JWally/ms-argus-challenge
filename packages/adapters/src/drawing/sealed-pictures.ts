/* jscpd:ignore-start */

import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  packDrawingPictureBundle,
  sealBytes,
} from '@argus-challenge/contracts';
import {
  renderServerDrawingPictures,
  type DrawingPicturePrompt,
  type DrawingPictureRenderProfile,
  type DrawingPictureEncoding,
  type RenderedDrawingPictures,
  type RenderServerDrawingPicturesOptions,
} from './picture-renderer.js';

export {
  DEFAULT_DRAWING_PICTURE_FRAME_MS,
  DEFAULT_DRAWING_PICTURE_FRAMES,
  DEFAULT_DRAWING_PICTURE_VARIANTS,
  DRAWING_PICTURE_ALPHABET,
  buildDrawingPictureCatalog,
  renderServerDrawingPictures,
} from './picture-renderer.js';
export type {
  BuildDrawingPictureCatalogOptions,
  DrawingPictureCatalog,
  DrawingPicturePrompt,
  DrawingPictureRenderProfile,
  RenderDrawingMaskInput,
  RenderedDrawingPictures,
  RenderServerDrawingPicturesOptions,
} from './picture-renderer.js';

export interface SealedDrawingPictures {
  enc: string;
  sPub: string;
  kind: 'drawing-pictures';
  encoding: DrawingPictureEncoding;
  compression: 'none';
  width: number;
  height: number;
  framesPerPrompt: number;
  frameMs: number;
  pictureCount: number;
}

export interface DrawingPictureProfile {
  event: 'drawing_picture_profile';
  pictureCount: number;
  width: number;
  height: number;
  totalMs: number;
  keyMs: number;
  renderMs: number;
  packMs: number;
  sealMs: number;
  exportMs: number;
  renderProfile: DrawingPictureRenderProfile;
}

export interface SealDrawingPicturesInput {
  prompts: DrawingPicturePrompt[];
  clientPublicKey: string;
  compression: 'none';
  width?: number;
  height?: number;
  framesPerPrompt?: number;
  frameMs?: number;
  encoding?: DrawingPictureEncoding;
}

interface Timed<T> {
  value: T;
  durationMs: number;
}

interface DrawingPictureKeyMaterial {
  server: CryptoKeyPair;
  shared: CryptoKey;
}

interface SealMeasurements {
  startedAt: number;
  key: Timed<DrawingPictureKeyMaterial>;
  rendered: Timed<RenderedDrawingPictures>;
  packed: Timed<Uint8Array>;
  sealed: Timed<string>;
  publicKey: Timed<string>;
}

interface SealDependencies {
  renderPictures(prompts: DrawingPicturePrompt[]): Promise<RenderedDrawingPictures>;
  nowMilliseconds(): number;
  recordProfile(profile: DrawingPictureProfile): void;
}

export interface SealDrawingPicturesOverrides {
  renderPictures?: SealDependencies['renderPictures'];
  nowMilliseconds?: SealDependencies['nowMilliseconds'];
  recordProfile?: SealDependencies['recordProfile'];
}

function nowMilliseconds(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

async function measured<T>(operation: () => Promise<T>, now: () => number): Promise<Timed<T>> {
  const startedAt = now();
  const value = await operation();
  return { value, durationMs: now() - startedAt };
}

function profileFrom(
  measurements: SealMeasurements,
  dependencies: SealDependencies
): DrawingPictureProfile {
  const { rendered, key, packed, sealed, publicKey } = measurements;
  return {
    event: 'drawing_picture_profile',
    pictureCount: rendered.value.pictures.length,
    width: rendered.value.width,
    height: rendered.value.height,
    totalMs: roundMilliseconds(dependencies.nowMilliseconds() - measurements.startedAt),
    keyMs: roundMilliseconds(key.durationMs),
    renderMs: roundMilliseconds(rendered.durationMs),
    packMs: roundMilliseconds(packed.durationMs),
    sealMs: roundMilliseconds(sealed.durationMs),
    exportMs: roundMilliseconds(publicKey.durationMs),
    renderProfile: rendered.value.profile,
  };
}

function rendererOptions(input: SealDrawingPicturesInput): RenderServerDrawingPicturesOptions {
  const options: RenderServerDrawingPicturesOptions = {};
  if (input.width !== undefined) options.width = input.width;
  if (input.height !== undefined) options.height = input.height;
  if (input.framesPerPrompt !== undefined) options.framesPerPrompt = input.framesPerPrompt;
  if (input.frameMs !== undefined) options.frameMs = input.frameMs;
  if (input.encoding !== undefined) options.encoding = input.encoding;
  return options;
}

export async function sealDrawingPictures(
  input: SealDrawingPicturesInput,
  overrides: SealDrawingPicturesOverrides = {}
): Promise<SealedDrawingPictures> {
  const dependencies: SealDependencies = {
    renderPictures: renderServerDrawingPictures(rendererOptions(input)),
    nowMilliseconds,
    recordProfile: () => undefined,
    ...overrides,
  };
  const startedAt = dependencies.nowMilliseconds();
  const key = await measured(async () => {
    const server = await generateKeyPair();
    const shared = await deriveAesKey(
      server.privateKey,
      await importPublicKey(input.clientPublicKey)
    );
    return { server, shared };
  }, dependencies.nowMilliseconds);
  const rendered = await measured(
    () => dependencies.renderPictures(input.prompts),
    dependencies.nowMilliseconds
  );
  const packed = await measured(
    async () =>
      packDrawingPictureBundle({
        encoding: rendered.value.encoding,
        width: rendered.value.width,
        height: rendered.value.height,
        framesPerPrompt: rendered.value.framesPerPrompt,
        frameMs: rendered.value.frameMs,
        pictures: rendered.value.pictures,
      }),
    dependencies.nowMilliseconds
  );
  const [sealed, publicKey] = await Promise.all([
    measured(() => sealBytes(key.value.shared, packed.value), dependencies.nowMilliseconds),
    measured(() => exportPublicKey(key.value.server.publicKey), dependencies.nowMilliseconds),
  ]);
  dependencies.recordProfile(
    profileFrom({ startedAt, key, rendered, packed, sealed, publicKey }, dependencies)
  );
  return {
    enc: sealed.value,
    sPub: publicKey.value,
    kind: 'drawing-pictures',
    encoding: rendered.value.encoding,
    compression: input.compression,
    width: rendered.value.width,
    height: rendered.value.height,
    framesPerPrompt: rendered.value.framesPerPrompt,
    frameMs: rendered.value.frameMs,
    pictureCount: rendered.value.pictures.length,
  };
}

/* jscpd:ignore-end */
