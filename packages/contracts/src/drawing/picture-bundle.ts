const MAGIC = [0x41, 0x44, 0x50, 0x42] as const;
const VERSION = 4;
const LEGACY_GRAY8_VERSION = 3;
const HEADER_BYTES = 14;
const FRAME_LENGTH_BYTES = 4;
const MAX_DIMENSION = 1_024;
const MAX_PICTURES = 255;
const MAX_FRAMES_PER_PROMPT = 255;
const MAX_PNG_PICTURE_BYTES = 1_048_576;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type DrawingPictureEncoding = 'gray8' | 'png';

export interface DrawingPictureBundle {
  encoding?: DrawingPictureEncoding;
  width: number;
  height: number;
  framesPerPrompt: number;
  frameMs: number;
  pictures: Uint8Array[];
}

function assertDimension(name: 'width' | 'height', value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
    throw new Error(`invalid_drawing_picture_${name}`);
  }
}

function gray8PictureByteLength(width: number, height: number): number {
  return width * height;
}

function normalizeEncoding(value: DrawingPictureEncoding | undefined): DrawingPictureEncoding {
  return value ?? 'gray8';
}

function encodingCode(encoding: DrawingPictureEncoding): number {
  return encoding === 'gray8' ? 0 : 1;
}

function encodingFromCode(value: number): DrawingPictureEncoding {
  if (value === 0) return 'gray8';
  if (value === 1) return 'png';
  throw new Error('invalid_drawing_picture_encoding');
}

function assertFramesPerPrompt(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_FRAMES_PER_PROMPT) {
    throw new Error('invalid_drawing_picture_frames_per_prompt');
  }
}

function assertFrameMs(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('invalid_drawing_picture_frame_ms');
  }
}

function hasPngSignature(picture: Uint8Array): boolean {
  return PNG_SIGNATURE.every((expected, index) => picture[index] === expected);
}

function assertPictureBytes(
  picture: Uint8Array,
  width: number,
  height: number,
  encoding: DrawingPictureEncoding
): void {
  if (encoding === 'gray8') {
    if (picture.byteLength !== gray8PictureByteLength(width, height)) {
      throw new Error('invalid_drawing_picture_bytes');
    }
    return;
  }
  if (
    picture.byteLength < PNG_SIGNATURE.length ||
    picture.byteLength > MAX_PNG_PICTURE_BYTES ||
    !hasPngSignature(picture)
  ) {
    throw new Error('invalid_drawing_picture_bytes');
  }
}

function assertPictures(bundle: DrawingPictureBundle): DrawingPictureEncoding {
  assertDimension('width', bundle.width);
  assertDimension('height', bundle.height);
  assertFramesPerPrompt(bundle.framesPerPrompt);
  assertFrameMs(bundle.frameMs);
  const encoding = normalizeEncoding(bundle.encoding);
  if (
    bundle.pictures.length < 1 ||
    bundle.pictures.length > MAX_PICTURES ||
    bundle.pictures.length % bundle.framesPerPrompt !== 0
  ) {
    throw new Error('invalid_drawing_picture_count');
  }
  for (const picture of bundle.pictures) {
    assertPictureBytes(picture, bundle.width, bundle.height, encoding);
  }
  return encoding;
}

export function packDrawingPictureBundle(bundle: DrawingPictureBundle): Uint8Array {
  const encoding = assertPictures(bundle);
  const packed = new Uint8Array(
    HEADER_BYTES +
      bundle.pictures.reduce((total, picture) => total + FRAME_LENGTH_BYTES + picture.byteLength, 0)
  );
  packed.set(MAGIC, 0);
  packed[4] = VERSION;
  packed[5] = bundle.pictures.length;
  packed[6] = bundle.framesPerPrompt;
  packed[7] = encodingCode(encoding);
  const view = new DataView(packed.buffer);
  view.setUint16(8, bundle.width, false);
  view.setUint16(10, bundle.height, false);
  view.setUint16(12, bundle.frameMs, false);
  let offset = HEADER_BYTES;
  for (const picture of bundle.pictures) {
    view.setUint32(offset, picture.byteLength, false);
    offset += FRAME_LENGTH_BYTES;
    packed.set(picture, offset);
    offset += picture.byteLength;
  }
  return packed;
}

function assertHeader(bytes: Uint8Array): {
  pictureCount: number;
  framesPerPrompt: number;
  frameMs: number;
  width: number;
  height: number;
  version: number;
  encoding: DrawingPictureEncoding;
} {
  if (bytes.byteLength < HEADER_BYTES) throw new Error('invalid_drawing_picture_bundle');
  for (const [index, expected] of MAGIC.entries()) {
    if (bytes[index] !== expected) throw new Error('invalid_drawing_picture_bundle_magic');
  }
  const version = bytes[4] ?? 0;
  if (version !== VERSION && version !== LEGACY_GRAY8_VERSION) {
    throw new Error('unsupported_drawing_picture_bundle_version');
  }
  const pictureCount = bytes[5] ?? 0;
  if (pictureCount < 1 || pictureCount > MAX_PICTURES) {
    throw new Error('invalid_drawing_picture_count');
  }
  const framesPerPrompt = bytes[6] ?? 0;
  assertFramesPerPrompt(framesPerPrompt);
  if (pictureCount % framesPerPrompt !== 0) throw new Error('invalid_drawing_picture_count');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(8, false);
  const height = view.getUint16(10, false);
  const frameMs = view.getUint16(12, false);
  assertDimension('width', width);
  assertDimension('height', height);
  assertFrameMs(frameMs);
  const encoding =
    version === LEGACY_GRAY8_VERSION ? 'gray8' : encodingFromCode(bytes[7] ?? Number.NaN);
  return {
    pictureCount,
    framesPerPrompt,
    frameMs,
    width,
    height,
    version,
    encoding,
  };
}

export function unpackDrawingPictureBundle(bytes: Uint8Array): DrawingPictureBundle {
  const { pictureCount, framesPerPrompt, frameMs, width, height, version, encoding } =
    assertHeader(bytes);
  const pictures: Uint8Array[] = [];
  let offset = HEADER_BYTES;
  if (version === LEGACY_GRAY8_VERSION) {
    const expectedBytes = gray8PictureByteLength(width, height);
    const expectedTotal = HEADER_BYTES + pictureCount * expectedBytes;
    if (bytes.byteLength < expectedTotal) throw new Error('truncated_drawing_picture_bundle');
    if (bytes.byteLength > expectedTotal) throw new Error('trailing_drawing_picture_bundle_bytes');
    for (let index = 0; index < pictureCount; index += 1) {
      pictures.push(bytes.slice(offset, offset + expectedBytes));
      offset += expectedBytes;
    }
    return { encoding, width, height, framesPerPrompt, frameMs, pictures };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < pictureCount; index += 1) {
    if (offset + FRAME_LENGTH_BYTES > bytes.byteLength) {
      throw new Error('truncated_drawing_picture_bundle');
    }
    const pictureBytes = view.getUint32(offset, false);
    offset += FRAME_LENGTH_BYTES;
    if (offset + pictureBytes > bytes.byteLength) {
      throw new Error('truncated_drawing_picture_bundle');
    }
    const picture = bytes.slice(offset, offset + pictureBytes);
    assertPictureBytes(picture, width, height, encoding);
    pictures.push(picture);
    offset += pictureBytes;
  }
  if (offset !== bytes.byteLength) throw new Error('trailing_drawing_picture_bundle_bytes');
  return { encoding, width, height, framesPerPrompt, frameMs, pictures };
}
