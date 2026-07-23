export interface WorkerKeyMaterial {
  clientPublicKey: string;
  workerUrl: string;
  workerSha256: string;
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
  if (
    message?.type !== 'key' ||
    typeof message.clientPublicKey !== 'string' ||
    typeof message.workerUrl !== 'string' ||
    typeof message.workerSha256 !== 'string'
  ) {
    return null;
  }
  return {
    clientPublicKey: message.clientPublicKey,
    workerUrl: message.workerUrl,
    workerSha256: message.workerSha256,
  };
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
