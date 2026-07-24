import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  openBytes,
} from '@argus-challenge/contracts/qr/ecdh-seal';
import { unpackQrFrameBundle } from '@argus-challenge/contracts/qr/frame-bundle';

type Input =
  | { type: 'keygen' }
  | {
      type: 'render';
      enc: string;
      sPub: string;
      kind?: 'png' | 'png-frames';
      compression?: 'none';
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

scope.onmessage = (event): void => {
  const task = event.data.type === 'keygen' ? createKey() : renderFrames(event.data);
  void task.catch((error: unknown) => {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'qr_worker_failed',
    });
  });
};
