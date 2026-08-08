import { describe, expect, it } from 'vitest';
import { renderBioDotPngFrame } from './bio-dot-frame.js';
import {
  inkBounds,
  isBackgroundHue,
  isSignalHue,
  pixelDiffers,
  pixelBrightness,
  rawPngPixels,
  signalGeometry,
} from './bio-dot-frame-test-support.js';
import { renderSvgMask } from './svg-mask.js';

describe('bio dot drawing picture frames', () => {
  it('renders one complete high-contrast glyph over glyph-colored static', async () => {
    const width = 240;
    const height = 108;
    const mask = await renderSvgMask({
      letter: 'B',
      seed: 'continuous-glyph:B',
      width,
      height,
    });
    const picture = await renderBioDotPngFrame({
      letter: 'B',
      variantIndex: 0,
      frameIndex: 0,
      framesPerPrompt: 1,
      mask,
      width,
      height,
    });
    const backgroundOnlyPicture = await renderBioDotPngFrame({
      letter: 'B',
      variantIndex: 0,
      frameIndex: 0,
      framesPerPrompt: 1,
      mask: new Uint8Array(width * height),
      width,
      height,
    });
    const pixels = await rawPngPixels(picture);
    const backgroundPixelsOnly = await rawPngPixels(backgroundOnlyPicture);
    let signalPixels = 0;
    let signalBrightness = 0;
    let backgroundPixels = 0;
    let backgroundBrightness = 0;
    for (let offset = 0; offset < pixels.byteLength; offset += 3) {
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      if (pixelDiffers(pixels, backgroundPixelsOnly, offset) && isSignalHue(r, g, b)) {
        signalPixels += 1;
        signalBrightness += pixelBrightness(r, g, b);
      }
      if (isBackgroundHue(r, g, b)) {
        backgroundPixels += 1;
        backgroundBrightness += pixelBrightness(r, g, b);
      }
    }
    let backgroundOnlySignalPixels = 0;
    let backgroundOnlySignalBrightness = 0;
    for (let offset = 0; offset < backgroundPixelsOnly.byteLength; offset += 3) {
      const r = backgroundPixelsOnly[offset] ?? 0;
      const g = backgroundPixelsOnly[offset + 1] ?? 0;
      const b = backgroundPixelsOnly[offset + 2] ?? 0;
      if (isSignalHue(r, g, b)) {
        backgroundOnlySignalPixels += 1;
        backgroundOnlySignalBrightness += pixelBrightness(r, g, b);
      }
    }

    expect(signalPixels).toBeGreaterThan(100);
    expect(backgroundPixels).toBeGreaterThan(100);
    expect(backgroundOnlySignalPixels).toBeGreaterThan(width * height * 0.028);
    expect(backgroundOnlySignalPixels).toBeLessThan(width * height * 0.08);
    expect(signalBrightness / signalPixels).toBeGreaterThan(150);
    expect(backgroundOnlySignalBrightness / backgroundOnlySignalPixels).toBeGreaterThan(150);
    expect(backgroundBrightness / backgroundPixels).toBeLessThan(24);
  });

  it('keeps every horizontal quarter of the requested glyph visible in one PNG', async () => {
    const width = 240;
    const height = 108;
    const mask = await renderSvgMask({
      letter: 'B',
      seed: 'complete-glyph:B',
      width,
      height,
    });
    const bounds = inkBounds(mask, width, height);
    const pixels = await rawPngPixels(
      await renderBioDotPngFrame({
        letter: 'B',
        variantIndex: 0,
        frameIndex: 0,
        framesPerPrompt: 1,
        mask,
        width,
        height,
      })
    );
    const baseline = await rawPngPixels(
      await renderBioDotPngFrame({
        letter: 'B',
        variantIndex: 0,
        frameIndex: 0,
        framesPerPrompt: 1,
        mask: new Uint8Array(width * height),
        width,
        height,
      })
    );
    const signalByQuarter = [0, 0, 0, 0];
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      if ((mask[y * width + x] ?? 0) <= 128) continue;
      const offset = pixelIndex * 3;
      if (
        !pixelDiffers(pixels, baseline, offset) ||
        !isSignalHue(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0)
      ) {
        continue;
      }
      const quarter = Math.min(3, Math.floor(((x - bounds.minX) / Math.max(1, bounds.width)) * 4));
      signalByQuarter[quarter]! += 1;
    }

    expect(Math.min(...signalByQuarter)).toBeGreaterThan(Math.max(...signalByQuarter) * 0.2);
  });

  it('deterministically moves the background field between PNG frames', async () => {
    const width = 240;
    const height = 108;
    const input = {
      letter: 'B',
      variantIndex: 0,
      framesPerPrompt: 4,
      mask: new Uint8Array(width * height),
      width,
      height,
    };
    const first = await rawPngPixels(await renderBioDotPngFrame({ ...input, frameIndex: 0 }));
    const firstAgain = await rawPngPixels(await renderBioDotPngFrame({ ...input, frameIndex: 0 }));
    const second = await rawPngPixels(await renderBioDotPngFrame({ ...input, frameIndex: 1 }));
    let changedPixels = 0;
    for (let offset = 0; offset < first.byteLength; offset += 3) {
      if (
        first[offset] !== second[offset] ||
        first[offset + 1] !== second[offset + 1] ||
        first[offset + 2] !== second[offset + 2]
      ) {
        changedPixels += 1;
      }
    }

    expect(first.equals(firstAgain)).toBe(true);
    expect(changedPixels).toBeGreaterThan(width * height * 0.3);
    expect(changedPixels).toBeLessThan(width * height * 0.5);
  });

  it('alternates complementary glyph halves across two PNG frames', async () => {
    const width = 240;
    const height = 108;
    const mask = await renderSvgMask({
      letter: 'W',
      seed: 'complete-animated-glyph:W',
      width,
      height,
    });
    const maskGeometry = inkBounds(mask, width, height);
    const frames = await Promise.all(
      Array.from({ length: 2 }, (_, frameIndex) =>
        Promise.all([
          renderBioDotPngFrame({
            letter: 'W',
            variantIndex: 0,
            frameIndex,
            framesPerPrompt: 2,
            mask,
            width,
            height,
          }).then(rawPngPixels),
          renderBioDotPngFrame({
            letter: 'W',
            variantIndex: 0,
            frameIndex,
            framesPerPrompt: 2,
            mask: new Uint8Array(width * height),
            width,
            height,
          }).then(rawPngPixels),
        ])
      )
    );
    const geometry = frames.map(([pixels, baseline]) =>
      signalGeometry(pixels, width, height, baseline)
    );

    for (const frame of geometry) {
      expect(frame.count).toBeGreaterThan(40);
      expect(frame.width).toBeGreaterThan(maskGeometry.width * 0.25);
      expect(frame.width).toBeLessThan(maskGeometry.width * 0.9);
      expect(frame.height).toBeGreaterThan(maskGeometry.height * 0.65);
    }
    const leftCenter = geometry[0]!.centerX;
    const rightCenter = geometry[1]!.centerX;
    expect(rightCenter - leftCenter).toBeGreaterThan(maskGeometry.width * 0.25);
    expect(Math.min(...geometry.map(({ minX }) => minX))).toBeLessThan(
      maskGeometry.centerX - maskGeometry.width * 0.25
    );
    expect(Math.max(...geometry.map(({ maxX }) => maxX))).toBeGreaterThan(
      maskGeometry.centerX + maskGeometry.width * 0.25
    );
  });
});
