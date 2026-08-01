import { describe, expect, it } from 'vitest';
import { buildBioPictureSnow } from '../../../contracts/src/drawing/bio-picture-snow.js';
import {
  BIO_PICTURE_SIGNAL_COLORS,
  buildBioPictureDots,
} from '../../../contracts/src/drawing/bio-picture-style.js';

type BioPictureFrames = ReturnType<typeof buildBioPictureDots>[];

function samplesH(x: number, y: number): boolean {
  const isLeftStem = x >= 48 && x <= 78;
  const isRightStem = x >= 162 && x <= 192;
  const isCrossbar = x >= 48 && x <= 192 && y >= 45 && y <= 63;
  return isLeftStem || isRightStem || isCrossbar;
}

function buildHFrames(): BioPictureFrames {
  return Array.from({ length: 4 }, (_, frameIndex) =>
    buildBioPictureDots({
      letter: 'H',
      variantIndex: 0,
      frameIndex,
      framesPerPrompt: 4,
      width: 240,
      height: 108,
      sampleLetter: samplesH,
    })
  );
}

function retainedMidpoint(frame: BioPictureFrames[number]): number {
  const retainedDots = frame.filter((dot) => dot.isLetter);
  return (
    (Math.min(...retainedDots.map((dot) => dot.x)) +
      Math.max(...retainedDots.map((dot) => dot.x))) /
    2
  );
}

function expectExclusiveSidePartitions(frames: BioPictureFrames, midpoint: number): void {
  const firstFrame = frames[0]!;
  for (let dotIndex = 0; dotIndex < firstFrame.length; dotIndex += 1) {
    const dot = firstFrame[dotIndex]!;
    const visibility = frames.map((frame) => frame[dotIndex]!.isVisibleLetter);
    if (!dot.isLetter) {
      expect(visibility).toEqual([false, false, false, false]);
      continue;
    }
    expect(visibility.filter(Boolean)).toHaveLength(1);
    const visibleFrameIndex = visibility.findIndex(Boolean);
    expect(dot.x <= midpoint ? [0, 2] : [1, 3]).toContain(visibleFrameIndex);
  }
}

function expectSidePartitionRatios(frames: BioPictureFrames, midpoint: number): void {
  const retainedDots = frames[0]!.filter((dot) => dot.isLetter);
  const retainedLeftCount = retainedDots.filter((dot) => dot.x <= midpoint).length;
  const retainedRightCount = retainedDots.length - retainedLeftCount;
  for (const [frameIndexes, retainedSideCount] of [
    [[0, 2], retainedLeftCount],
    [[1, 3], retainedRightCount],
  ] as const) {
    for (const frameIndex of frameIndexes) {
      const visibleCount = frames[frameIndex]!.filter((dot) => dot.isVisibleLetter).length;
      expect(visibleCount / retainedSideCount).toBeGreaterThan(0.45);
      expect(visibleCount / retainedSideCount).toBeLessThan(0.55);
    }
  }
}

describe('Bio picture style', () => {
  it('retains about 95 percent of sampled glyph blocks in a single-frame picture', () => {
    const width = 240;
    const height = 108;
    const dots = buildBioPictureDots({
      letter: 'B',
      variantIndex: 0,
      frameIndex: 0,
      framesPerPrompt: 1,
      width,
      height,
      sampleLetter: () => true,
    });
    const letterRatio = dots.filter((dot) => dot.isLetter).length / dots.length;

    expect(letterRatio).toBeGreaterThan(0.92);
    expect(letterRatio).toBeLessThan(0.98);
  });

  it('partitions retained H dots across alternating left and right frames', () => {
    const frames = buildHFrames();
    const firstFrame = frames[0]!;

    expect(firstFrame).toHaveLength(frames[1]!.length);
    expect(firstFrame.map((dot) => dot.isLetter)).toEqual(frames[1]!.map((dot) => dot.isLetter));
    const midpoint = retainedMidpoint(firstFrame);
    expectExclusiveSidePartitions(frames, midpoint);
    expectSidePartitionRatios(frames, midpoint);
  });

  it('adds sparse background static at the same visual scale as glyph blocks', () => {
    const width = 600;
    const height = 270;
    const snow = buildBioPictureSnow({
      letter: 'B',
      variantIndex: 0,
      frameIndex: 0,
      width,
      height,
    });
    const letterDots = buildBioPictureDots({
      letter: 'B',
      variantIndex: 0,
      frameIndex: 0,
      framesPerPrompt: 1,
      width,
      height,
      sampleLetter: () => true,
    });
    const letterSizes = letterDots.map((dot) => dot.size);
    const colors = new Set(snow.map((speck) => speck.color));

    expect(snow.length).toBeGreaterThan(125);
    expect(snow.length).toBeLessThan(160);
    expect(snow.every((speck) => speck.width === speck.height)).toBe(true);
    expect(Math.min(...snow.map((speck) => speck.width))).toBeGreaterThanOrEqual(
      Math.min(...letterSizes) - 1
    );
    expect(Math.max(...snow.map((speck) => speck.width))).toBeLessThanOrEqual(
      Math.max(...letterSizes) + 1
    );
    expect(colors.size).toBeGreaterThanOrEqual(4);
    const signalColors = new Set<string>(BIO_PICTURE_SIGNAL_COLORS);
    expect([...colors].every((color) => signalColors.has(color))).toBe(true);
    expect(
      [...colors].every((color) => {
        const red = Number.parseInt(color.slice(1, 3), 16);
        const green = Number.parseInt(color.slice(3, 5), 16);
        const blue = Number.parseInt(color.slice(5, 7), 16);
        return red >= 190 && blue >= green && green >= red;
      })
    ).toBe(true);
  });
});
