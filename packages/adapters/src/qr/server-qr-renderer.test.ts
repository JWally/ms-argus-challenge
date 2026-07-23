import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { renderPairQrFrames } from './server-qr-renderer.js';

describe('server QR renderer', () => {
  it('renders a deterministic animated PNG bundle with stable dimensions', async () => {
    const result = await renderPairQrFrames(
      'https://challenge.example',
      'single-use-token',
      '?debug=true'
    );
    expect(result).toMatchObject({ frameMs: 180, frameCount: 4 });
    const decoded = result.frames.map((frame) => PNG.sync.read(Buffer.from(frame)));
    expect(new Set(decoded.map((image) => image.width))).toEqual(new Set([result.width]));
    expect(
      result.frames.every((frame) => Buffer.from(frame).subarray(1, 4).toString() === 'PNG')
    ).toBe(true);
    expect(Buffer.from(result.frames[0] ?? []).equals(Buffer.from(result.frames[1] ?? []))).toBe(
      false
    );
  });
});
