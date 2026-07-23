const MAGIC = [0x41, 0x51, 0x52, 0x46] as const;
const VERSION = 1;
const HEADER_BYTES = 8;
const FRAME_LENGTH_BYTES = 4;

export interface QrFrameBundle {
  frameMs: number;
  frames: Uint8Array[];
}

export function packQrFrameBundle(bundle: QrFrameBundle): Uint8Array {
  if (!Number.isInteger(bundle.frameMs) || bundle.frameMs < 1 || bundle.frameMs > 65_535) {
    throw new Error('invalid_qr_frame_ms');
  }
  if (bundle.frames.length < 1 || bundle.frames.length > 255) {
    throw new Error('invalid_qr_frame_count');
  }
  const totalBytes =
    HEADER_BYTES +
    bundle.frames.reduce((sum, frame) => sum + FRAME_LENGTH_BYTES + frame.byteLength, 0);
  const packed = new Uint8Array(totalBytes);
  packed.set(MAGIC, 0);
  packed[4] = VERSION;
  packed[5] = bundle.frames.length;
  const view = new DataView(packed.buffer);
  view.setUint16(6, bundle.frameMs, false);
  let offset = HEADER_BYTES;
  for (const frame of bundle.frames) {
    view.setUint32(offset, frame.byteLength, false);
    offset += FRAME_LENGTH_BYTES;
    packed.set(frame, offset);
    offset += frame.byteLength;
  }
  return packed;
}

function assertHeader(bytes: Uint8Array): number {
  if (bytes.byteLength < HEADER_BYTES) throw new Error('invalid_qr_frame_bundle');
  for (const [index, expected] of MAGIC.entries()) {
    if (bytes[index] !== expected) throw new Error('invalid_qr_frame_bundle_magic');
  }
  if (bytes[4] !== VERSION) throw new Error('unsupported_qr_frame_bundle_version');
  const frameCount = bytes[5] ?? 0;
  if (frameCount < 1) throw new Error('invalid_qr_frame_count');
  return frameCount;
}

export function unpackQrFrameBundle(bytes: Uint8Array): QrFrameBundle {
  const frameCount = assertHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameMs = view.getUint16(6, false);
  const frames: Uint8Array[] = [];
  let offset = HEADER_BYTES;
  for (let index = 0; index < frameCount; index += 1) {
    if (offset + FRAME_LENGTH_BYTES > bytes.byteLength) {
      throw new Error('truncated_qr_frame_bundle');
    }
    const frameLength = view.getUint32(offset, false);
    offset += FRAME_LENGTH_BYTES;
    if (offset + frameLength > bytes.byteLength) {
      throw new Error('truncated_qr_frame_bundle');
    }
    frames.push(bytes.slice(offset, offset + frameLength));
    offset += frameLength;
  }
  if (offset !== bytes.byteLength) throw new Error('trailing_qr_frame_bundle_bytes');
  return { frameMs, frames };
}
