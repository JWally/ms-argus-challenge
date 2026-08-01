import { describe, expect, it } from 'vitest';
import { variantSeed } from './dot-frame.js';
import {
  DEFAULT_DRAWING_PICTURE_VARIANTS,
  DRAWING_PICTURE_ALPHABET,
} from './picture-renderer-config.js';
import { renderSvgMask } from './svg-mask.js';
import { countInkInRect, inkBounds } from './bio-dot-frame-test-support.js';

describe('bio dot drawing picture masks', () => {
  it('preserves continuous glyph rows when Sharp returns a multichannel dilation buffer', async () => {
    for (const letter of DRAWING_PICTURE_ALPHABET) {
      for (
        let variantIndex = 0;
        variantIndex < DEFAULT_DRAWING_PICTURE_VARIANTS;
        variantIndex += 1
      ) {
        const width = 240;
        const height = 108;
        const mask = await renderSvgMask({
          letter,
          seed: variantSeed(letter, variantIndex),
          width,
          height,
        });
        const bounds = inkBounds(mask, width, height);
        const blankInteriorRows = Array.from({ length: bounds.height }, (_, offset) => {
          const y = bounds.minY + offset;
          return !mask
            .subarray(y * width + bounds.minX, y * width + bounds.maxX + 1)
            .some((pixel) => pixel > 128);
        }).filter(Boolean);

        expect(blankInteriorRows, `${letter}${variantIndex}`).toHaveLength(0);
      }
    }
  }, 15_000);

  it('renders non-empty packed source masks for every drawing letter', async () => {
    for (const letter of DRAWING_PICTURE_ALPHABET) {
      const mask = await renderSvgMask({
        letter,
        seed: `source-mask-coverage:${letter}`,
        width: 240,
        height: 108,
      });
      let ink = 0;
      for (const pixel of mask) {
        if (pixel > 128) ink += 1;
      }

      expect(ink, letter).toBeGreaterThan(250);
    }
  });

  it('keeps source masks small enough to avoid phone zoom/clipping', async () => {
    const width = 240;
    const height = 108;
    for (const letter of DRAWING_PICTURE_ALPHABET) {
      const mask = await renderSvgMask({
        letter,
        seed: `source-mask-phone-bounds:${letter}`,
        width,
        height,
      });
      const bounds = inkBounds(mask, width, height);

      expect(bounds.minX, letter).toBeGreaterThanOrEqual(0);
      expect(bounds.minY, letter).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, letter).toBeLessThan(width);
      expect(bounds.maxY, letter).toBeLessThan(height);
      expect(bounds.height, letter).toBeGreaterThan(48);
      expect(bounds.height, letter).toBeLessThanOrEqual(Math.round(height * 0.84));
      expect(bounds.width, letter).toBeGreaterThan(40);
      expect(bounds.width, letter).toBeLessThanOrEqual(Math.round(width * 0.62));
    }
  });

  it('randomizes source mask placement by seed without clipping', async () => {
    const width = 240;
    const height = 108;
    const boundsBySeed = [];
    for (let seedIndex = 0; seedIndex < 24; seedIndex += 1) {
      const mask = await renderSvgMask({
        letter: 'B',
        seed: `source-mask-placement:${seedIndex}`,
        width,
        height,
      });
      const bounds = inkBounds(mask, width, height);
      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.minY).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThan(width);
      expect(bounds.maxY).toBeLessThan(height);
      boundsBySeed.push(bounds);
    }

    const xCenters = boundsBySeed.map((bounds) => bounds.centerX);
    const yCenters = boundsBySeed.map((bounds) => bounds.centerY);
    expect(Math.max(...xCenters) - Math.min(...xCenters)).toBeGreaterThan(width * 0.2);
    expect(Math.max(...yCenters) - Math.min(...yCenters)).toBeGreaterThan(height * 0.1);
  });

  it('gives J a visible hook and serif so it does not read as I', async () => {
    const width = 240;
    const height = 108;
    const mask = await renderSvgMask({
      letter: 'J',
      seed: 'source-mask-j-hook:J',
      width,
      height,
    });
    const bounds = inkBounds(mask, width, height);

    expect(
      countInkInRect({
        mask,
        width,
        x0: bounds.minX,
        y0: bounds.minY + Math.floor(bounds.height * 0.62),
        x1: bounds.minX + Math.floor(bounds.width * 0.55),
        y1: bounds.maxY + 1,
      })
    ).toBeGreaterThan(150);
    expect(
      countInkInRect({
        mask,
        width,
        x0: bounds.minX + Math.floor(bounds.width * 0.15),
        y0: bounds.minY,
        x1: bounds.maxX + 1 - Math.floor(bounds.width * 0.15),
        y1: bounds.minY + Math.floor(bounds.height * 0.25),
      })
    ).toBeGreaterThan(80);
  });
});
