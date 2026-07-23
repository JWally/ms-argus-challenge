import { withDeadline } from '../../shared/deadline.js';
import {
  readKeyMaterial,
  readRenderedFrames,
  type RenderedQrFrames,
  type WorkerKeyMaterial,
} from './qr-protocol.js';

interface SealedQrResponse {
  enc: string;
  sPub: string;
  kind?: 'png' | 'png-frames';
  compression?: 'none';
}

function waitForMessage<T>(
  worker: Worker,
  read: (value: unknown) => T | null,
  operation: string
): Promise<T> {
  const response = new Promise<T>((resolve, reject) => {
    const listener = (event: MessageEvent): void => {
      const parsed = read(event.data);
      if (!parsed) return;
      worker.removeEventListener('message', listener);
      resolve(parsed);
    };
    worker.addEventListener('message', listener);
    worker.addEventListener('error', () => reject(new Error(`${operation}_failed`)), {
      once: true,
    });
  });
  return withDeadline(response, 15_000, operation);
}

export class QrKeyholder {
  private readonly worker = new Worker('/qr-worker.js');

  key(): Promise<WorkerKeyMaterial> {
    const response = waitForMessage(this.worker, readKeyMaterial, 'qr_keygen');
    this.worker.postMessage({ type: 'keygen' });
    return response;
  }

  render(sealed: SealedQrResponse): Promise<RenderedQrFrames> {
    const response = waitForMessage(this.worker, readRenderedFrames, 'qr_render');
    this.worker.postMessage({ type: 'render', ...sealed });
    return response;
  }

  close(): void {
    this.worker.terminate();
  }
}
