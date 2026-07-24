import { describe, expect, it } from 'vitest';
import { readKeyMaterial, readRenderedFrames } from './qr-protocol.js';

describe('QR worker protocol', () => {
  it('accepts only the ephemeral public key used to seal QR frames', () => {
    expect(readKeyMaterial({ type: 'key', clientPublicKey: 'public' })).toEqual({
      clientPublicKey: 'public',
    });
    expect(readKeyMaterial({ type: 'key' })).toBeNull();
  });

  it('rejects empty frame sets', () => {
    expect(readRenderedFrames({ type: 'frames', frames: [], frameMs: 300 })).toBeNull();
  });
});
