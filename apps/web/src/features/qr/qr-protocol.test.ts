import { describe, expect, it } from 'vitest';
import { readKeyMaterial, readRenderedFrames } from './qr-protocol.js';

describe('QR worker protocol', () => {
  it('requires public key, worker URL, and self-hash together', () => {
    expect(
      readKeyMaterial({
        type: 'key',
        clientPublicKey: 'public',
        workerUrl: 'https://challenge.example/qr-worker.js',
        workerSha256: `sha256-${'a'.repeat(43)}`,
      })
    ).toMatchObject({ clientPublicKey: 'public' });
    expect(readKeyMaterial({ type: 'key', clientPublicKey: 'public' })).toBeNull();
  });

  it('rejects empty frame sets', () => {
    expect(readRenderedFrames({ type: 'frames', frames: [], frameMs: 300 })).toBeNull();
  });
});
