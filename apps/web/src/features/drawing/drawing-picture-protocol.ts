export type DrawingPictureEncoding = 'gray8' | 'png';

export interface RenderedDrawingPictures {
  encoding: DrawingPictureEncoding;
  width: number;
  height: number;
  framesPerPrompt: number;
  frameMs: number;
  pictures: Uint8Array[];
}

type DrawingPictureMetadata = Omit<RenderedDrawingPictures, 'pictures'>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function drawingPictureEncoding(value: unknown): DrawingPictureEncoding | null {
  if (value === 'gray8' || value === 'png') return value;
  return null;
}

function transferredPictures(value: unknown): Uint8Array[] | null {
  if (!Array.isArray(value) || value.length < 1) return null;
  return value.map((picture) =>
    picture instanceof Uint8Array ? picture : new Uint8Array(picture as ArrayBuffer)
  );
}

function drawingPictureMetadata(
  message: Record<string, unknown> | null
): DrawingPictureMetadata | null {
  const width = message?.width;
  const height = message?.height;
  const framesPerPrompt = message?.framesPerPrompt;
  const frameMs = message?.frameMs;
  const encoding = drawingPictureEncoding(message?.encoding);
  if (!encoding) return null;
  if (!positiveInteger(width)) return null;
  if (!positiveInteger(height)) return null;
  if (!positiveInteger(framesPerPrompt)) return null;
  if (!positiveInteger(frameMs)) return null;
  return { encoding, width, height, framesPerPrompt, frameMs };
}

function picturesMatchMetadata(metadata: DrawingPictureMetadata, pictures: Uint8Array[]): boolean {
  if (pictures.length % metadata.framesPerPrompt !== 0) return false;
  if (metadata.encoding !== 'gray8') return true;
  return pictures.every((picture) => picture.byteLength === metadata.width * metadata.height);
}

export function readDrawingPictures(value: unknown): RenderedDrawingPictures | null {
  const message = record(value);
  if (message?.type !== 'drawing-pictures') return null;
  const metadata = drawingPictureMetadata(message);
  const pictures = transferredPictures(message.pictures);
  if (!pictures) return null;
  if (!metadata || !picturesMatchMetadata(metadata, pictures)) return null;
  return { ...metadata, pictures };
}
