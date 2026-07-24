export interface WorkerKeyMaterial {
  clientPublicKey: string;
}

export interface RenderedQrFrames {
  frames: Uint8Array[];
  frameMs: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readKeyMaterial(value: unknown): WorkerKeyMaterial | null {
  const message = record(value);
  if (message?.type !== 'key' || typeof message.clientPublicKey !== 'string') {
    return null;
  }
  return { clientPublicKey: message.clientPublicKey };
}

export function readRenderedFrames(value: unknown): RenderedQrFrames | null {
  const message = record(value);
  if (
    message?.type !== 'frames' ||
    !Array.isArray(message.frames) ||
    message.frames.length < 1 ||
    typeof message.frameMs !== 'number'
  ) {
    return null;
  }
  const frames = message.frames.map((frame) =>
    frame instanceof Uint8Array ? frame : new Uint8Array(frame as ArrayBuffer)
  );
  return { frames, frameMs: message.frameMs };
}
