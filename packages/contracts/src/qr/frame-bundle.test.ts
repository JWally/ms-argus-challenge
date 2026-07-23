import { describe, expect, it } from 'vitest';
import { packQrFrameBundle, unpackQrFrameBundle } from './frame-bundle.js';

describe('QR frame bundle', () => {
  it('round trips binary PNG frames and timing', () => {
    const frames = [new Uint8Array([137, 80, 78, 71]), new Uint8Array([1, 2, 3])];
    const packed = packQrFrameBundle({ frameMs: 180, frames });
    expect(unpackQrFrameBundle(packed)).toEqual({ frameMs: 180, frames });
  });

  it('rejects malformed counts, timing, truncation, and trailing bytes', () => {
    expect(() => packQrFrameBundle({ frameMs: 0, frames: [new Uint8Array()] })).toThrow();
    expect(() => packQrFrameBundle({ frameMs: 1, frames: [] })).toThrow();
    const valid = packQrFrameBundle({ frameMs: 180, frames: [new Uint8Array([1])] });
    expect(() => unpackQrFrameBundle(valid.slice(0, -1))).toThrow('truncated');
    const trailing = new Uint8Array(valid.length + 1);
    trailing.set(valid);
    expect(() => unpackQrFrameBundle(trailing)).toThrow('trailing');
  });
});
