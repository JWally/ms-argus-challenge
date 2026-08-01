import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderBioDotPngFrame } from './bio-dot-frame.js';
import { isSignalHue, pixelDiffers, rawPngPixels } from './bio-dot-frame-test-support.js';
import { renderSvgMask } from './svg-mask.js';

describe('bio dot drawing picture mobile rendering', () => {
  it('renders one centered glyph tile for composite assembly', async () => {
    const width = 240;
    const height = 108;
    const variantIndex = 0;
    const mask = await renderSvgMask({
      letter: 'B',
      seed: 'single-glyph:B',
      width,
      height,
    });
    const picture = await renderBioDotPngFrame({
      letter: 'B',
      variantIndex,
      frameIndex: 1,
      framesPerPrompt: 4,
      mask,
      width,
      height,
    });
    const pixels = await rawPngPixels(picture);
    const baseline = await rawPngPixels(
      await renderBioDotPngFrame({
        letter: 'B',
        variantIndex,
        frameIndex: 1,
        framesPerPrompt: 4,
        mask: new Uint8Array(width * height),
        width,
        height,
      })
    );
    let signalPixels = 0;
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const offset = pixelIndex * 3;
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      if (!pixelDiffers(pixels, baseline, offset) || !isSignalHue(r, g, b)) continue;
      signalPixels += 1;
    }

    expect(signalPixels).toBeGreaterThan(10);
  });

  it('keeps the complete letter visible after iPhone-sized downscaling without bloating PNGs', async () => {
    const width = 600;
    const height = 270;
    const variantIndex = 0;
    const frameIndex = 0;
    const mask = await renderSvgMask({
      letter: 'B',
      seed: 'drawing-picture:B:0',
      width,
      height,
    });
    const picture = await renderBioDotPngFrame({
      letter: 'B',
      variantIndex,
      frameIndex,
      framesPerPrompt: 1,
      mask,
      width,
      height,
    });
    const pixels = await sharp(Buffer.from(picture))
      .resize(360, 162, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    const baseline = await sharp(
      Buffer.from(
        await renderBioDotPngFrame({
          letter: 'B',
          variantIndex,
          frameIndex,
          framesPerPrompt: 1,
          mask: new Uint8Array(width * height),
          width,
          height,
        })
      )
    )
      .resize(360, 162, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    let signalPixels = 0;
    for (let offset = 0; offset < pixels.byteLength; offset += 3) {
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      if (pixelDiffers(pixels, baseline, offset) && isSignalHue(r, g, b)) signalPixels += 1;
    }

    expect(signalPixels).toBeGreaterThan(350);
    expect(picture.byteLength).toBeLessThan(75_000);
  });

  it('keeps each complementary frame visibly tied to the letter ink', async () => {
    const width = 240;
    const height = 108;
    const variantIndex = 0;
    const mask = await renderSvgMask({
      letter: 'B',
      seed: 'eight-piece-visible:B',
      width,
      height,
    });

    for (let frameIndex = 0; frameIndex < 2; frameIndex += 1) {
      const picture = await renderBioDotPngFrame({
        letter: 'B',
        variantIndex,
        frameIndex,
        framesPerPrompt: 2,
        mask,
        width,
        height,
      });
      const pixels = await rawPngPixels(picture);
      const baseline = await rawPngPixels(
        await renderBioDotPngFrame({
          letter: 'B',
          variantIndex,
          frameIndex,
          framesPerPrompt: 2,
          mask: new Uint8Array(width * height),
          width,
          height,
        })
      );
      let signalPixels = 0;
      for (let offset = 0; offset < pixels.byteLength; offset += 3) {
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        if (pixelDiffers(pixels, baseline, offset) && isSignalHue(r, g, b)) signalPixels += 1;
      }
      expect(signalPixels, `frame ${frameIndex}`).toBeGreaterThan(10);
    }
  });
});
