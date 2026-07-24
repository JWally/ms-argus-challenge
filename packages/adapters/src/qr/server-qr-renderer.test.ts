import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  createPairQrRenderer,
  QR_FRAME_CORRUPTION_RATES,
  renderPairQrFrames,
} from './server-qr-renderer.js';

describe('server QR renderer', () => {
  it('uses independent 15% corruption masks for both high-noise frames', async () => {
    expect(QR_FRAME_CORRUPTION_RATES).toEqual([0.005, 0.15, 0.01, 0.15]);

    const result = await renderPairQrFrames('https://challenge.example', 'single-use-token');

    expect(Buffer.from(result.frames[1] ?? []).equals(Buffer.from(result.frames[3] ?? []))).toBe(
      false
    );
  });

  it('renders a deterministic animated PNG bundle with stable dimensions', async () => {
    const result = await renderPairQrFrames(
      'https://challenge.example',
      'single-use-token',
      '?debug=true'
    );
    expect(result).toMatchObject({
      frameMs: 180,
      frameCount: 4,
      profile: {
        createMs: expect.any(Number),
        totalMs: expect.any(Number),
        frames: [
          { encodeMs: expect.any(Number), bytes: expect.any(Number) },
          { encodeMs: expect.any(Number), bytes: expect.any(Number) },
          { encodeMs: expect.any(Number), bytes: expect.any(Number) },
          { encodeMs: expect.any(Number), bytes: expect.any(Number) },
        ],
      },
    });
    const decoded = await Promise.all(
      result.frames.map((frame) => sharp(Buffer.from(frame)).metadata())
    );
    expect(new Set(decoded.map((image) => image.width))).toEqual(new Set([result.width]));
    expect(
      result.frames.every((frame) => Buffer.from(frame).subarray(1, 4).toString() === 'PNG')
    ).toBe(true);
    expect(Buffer.from(result.frames[0] ?? []).equals(Buffer.from(result.frames[1] ?? []))).toBe(
      false
    );
  });

  it('dispatches every native frame encode before waiting for completion', async () => {
    let releaseEncoders = (): void => undefined;
    const encoderGate = new Promise<void>((resolve) => {
      releaseEncoders = resolve;
    });
    const startedWidths: number[] = [];
    const render = createPairQrRenderer({
      encodePng: async ({ width }) => {
        startedWidths.push(width);
        await encoderGate;
        return new Uint8Array([137, 80, 78, 71]);
      },
    });

    const rendering = render('https://challenge.example', 'single-use-token');

    expect(startedWidths).toHaveLength(4);
    expect(new Set(startedWidths).size).toBe(1);
    releaseEncoders();
    await expect(rendering).resolves.toMatchObject({ frameCount: 4 });
  });
});
