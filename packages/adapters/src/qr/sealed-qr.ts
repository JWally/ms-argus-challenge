import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  packQrFrameBundle,
  sealBytes,
} from '@argus-challenge/contracts';
import { renderPairQrFrames } from './server-qr-renderer.js';

export interface SealedPairTokenQr {
  enc: string;
  sPub: string;
  kind: 'png-frames';
  compression: 'none';
  width: number;
  frameMs: number;
  frameCount: number;
}

export async function sealPairTokenQr(input: {
  pairOrigin: string;
  token: string;
  suffix?: string;
  clientPublicKey: string;
  compression: 'none';
}): Promise<SealedPairTokenQr> {
  const server = await generateKeyPair();
  const key = await deriveAesKey(server.privateKey, await importPublicKey(input.clientPublicKey));
  const rendered = await renderPairQrFrames(input.pairOrigin, input.token, input.suffix ?? '');
  const bundle = packQrFrameBundle({
    frameMs: rendered.frameMs,
    frames: rendered.frames,
  });
  const [enc, sPub] = await Promise.all([
    sealBytes(key, bundle),
    exportPublicKey(server.publicKey),
  ]);
  return {
    enc,
    sPub,
    kind: 'png-frames',
    compression: input.compression,
    width: rendered.width,
    frameMs: rendered.frameMs,
    frameCount: rendered.frameCount,
  };
}
