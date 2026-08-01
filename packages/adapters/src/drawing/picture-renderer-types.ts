import type { RenderDrawingMaskInput } from './svg-mask.js';

export type DrawingPictureEncoding = 'gray8' | 'png';

export interface DrawingPicturePrompt {
  letter: string;
  seed: string | number;
}

export interface DrawingPictureRenderProfile {
  pictureCount: number;
  width: number;
  height: number;
  framesPerPrompt: number;
  frameMs: number;
  encoding: DrawingPictureEncoding;
  cacheHits: number;
  cacheMisses: number;
  totalBytes: number;
  totalMs: number;
}

export interface RenderedDrawingPictures {
  encoding: DrawingPictureEncoding;
  width: number;
  height: number;
  framesPerPrompt: number;
  frameMs: number;
  pictures: Uint8Array[];
  profile: DrawingPictureRenderProfile;
}

export interface DrawingPictureCatalog {
  width: number;
  height: number;
  variantCount: number;
  framesPerPrompt: number;
  frameMs: number;
  encoding: DrawingPictureEncoding;
  pictures: Map<string, Uint8Array>;
}

export interface RenderServerDrawingPicturesOptions {
  encoding?: DrawingPictureEncoding;
  width?: number;
  height?: number;
  variantCount?: number;
  framesPerPrompt?: number;
  frameMs?: number;
  catalog?: DrawingPictureCatalog;
  cache?: Map<string, Uint8Array>;
  maskCache?: Map<string, Uint8Array>;
  renderMask?: (input: RenderDrawingMaskInput) => Promise<Uint8Array>;
  nowMilliseconds?: () => number;
}

export type BuildDrawingPictureCatalogOptions = Pick<
  RenderServerDrawingPicturesOptions,
  'encoding' | 'width' | 'height' | 'variantCount' | 'framesPerPrompt' | 'frameMs' | 'renderMask'
>;
