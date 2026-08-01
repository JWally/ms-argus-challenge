import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  openBytes,
} from '@argus-challenge/contracts/qr/ecdh-seal';
import { unpackDrawingPictureBundle } from '@argus-challenge/contracts/drawing/picture-bundle';
import { unpackQrFrameBundle } from '@argus-challenge/contracts/qr/frame-bundle';

type Input =
  | { type: 'keygen' }
  | {
      type: 'render';
      enc: string;
      sPub: string;
      kind?: 'png' | 'png-frames';
      compression?: 'none';
    }
  | {
      type: 'drawing-pictures';
      enc: string;
      sPub: string;
      kind?: 'drawing-pictures';
      encoding?: 'gray8' | 'png';
      compression?: 'none';
      width?: number;
      height?: number;
      framesPerPrompt?: number;
      frameMs?: number;
      pictureCount?: number;
    };

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<Input>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let privateKey: CryptoKey | null = null;

async function createKey(): Promise<void> {
  const pair = await generateKeyPair();
  privateKey = pair.privateKey;
  scope.postMessage({
    type: 'key',
    clientPublicKey: await exportPublicKey(pair.publicKey),
  });
}

async function renderFrames(message: Extract<Input, { type: 'render' }>): Promise<void> {
  if (!privateKey) throw new Error('qr_key_missing');
  if (message.kind !== 'png-frames' || message.compression !== 'none') {
    throw new Error('unsupported_qr_format');
  }
  const peer = await importPublicKey(message.sPub);
  const key = await deriveAesKey(privateKey, peer);
  const bundle = unpackQrFrameBundle(await openBytes(key, message.enc));
  const frames = bundle.frames.map((frame) => Uint8Array.from(frame));
  scope.postMessage(
    { type: 'frames', frames, frameMs: bundle.frameMs },
    frames.map((frame) => frame.buffer)
  );
  privateKey = null;
}

async function openDrawingPictures(
  message: Extract<Input, { type: 'drawing-pictures' }>
): Promise<void> {
  if (!privateKey) throw new Error('drawing_picture_key_missing');
  if (
    message.kind !== 'drawing-pictures' ||
    (message.encoding !== 'gray8' && message.encoding !== 'png') ||
    message.compression !== 'none'
  ) {
    throw new Error('unsupported_drawing_picture_format');
  }
  const peer = await importPublicKey(message.sPub);
  const key = await deriveAesKey(privateKey, peer);
  const bundle = unpackDrawingPictureBundle(await openBytes(key, message.enc));
  if (
    bundle.encoding !== message.encoding ||
    bundle.width !== message.width ||
    bundle.height !== message.height ||
    bundle.framesPerPrompt !== message.framesPerPrompt ||
    bundle.frameMs !== message.frameMs ||
    bundle.pictures.length !== message.pictureCount
  ) {
    throw new Error('drawing_picture_metadata_mismatch');
  }
  const pictures = bundle.pictures.map((picture) => Uint8Array.from(picture));
  scope.postMessage(
    {
      type: 'drawing-pictures',
      encoding: bundle.encoding,
      width: bundle.width,
      height: bundle.height,
      framesPerPrompt: bundle.framesPerPrompt,
      frameMs: bundle.frameMs,
      pictures,
    },
    pictures.map((picture) => picture.buffer)
  );
  privateKey = null;
}

scope.onmessage = (event): void => {
  const task =
    event.data.type === 'keygen'
      ? createKey()
      : event.data.type === 'drawing-pictures'
        ? openDrawingPictures(event.data)
        : renderFrames(event.data);
  void task.catch((error: unknown) => {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'qr_worker_failed',
    });
  });
};
