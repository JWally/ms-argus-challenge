import { describe, expect, it } from 'vitest';
import {
  BIO_PICTURE_STATIC_COLORS,
  buildBioPictureSnow,
} from '../../../contracts/src/drawing/bio-picture-snow.js';
import {
  BIO_PICTURE_SIGNAL_COLORS,
  bioPictureDotAppearance,
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

function buildBackgroundFrames(): BioPictureFrames {
  return Array.from({ length: 5 }, (_, frameIndex) =>
    buildBioPictureDots({
      letter: 'B',
      variantIndex: 0,
      frameIndex,
      framesPerPrompt: 4,
      width: 600,
      height: 270,
      sampleLetter: () => false,
    })
  );
}

function expectExclusivePartitions(frames: BioPictureFrames): void {
  const firstFrame = frames[0]!;
  for (let dotIndex = 0; dotIndex < firstFrame.length; dotIndex += 1) {
    const dot = firstFrame[dotIndex]!;
    const visibility = frames.map((frame) => frame[dotIndex]!.isVisibleLetter);
    if (!dot.isLetter) {
      expect(visibility).toEqual([false, false, false, false]);
      continue;
    }
    expect(visibility.filter(Boolean)).toHaveLength(1);
  }
}

function expectStationaryHorizontalPieces(frames: BioPictureFrames): void {
  const firstGlyphPositions = frames[0]!
    .filter((dot) => dot.isLetter)
    .map(({ x, y }) => ({ x, y }));
  for (const frame of frames.slice(1)) {
    expect(frame.filter((dot) => dot.isLetter).map(({ x, y }) => ({ x, y }))).toEqual(
      firstGlyphPositions
    );
  }

  const ranges = frames.map((frame) => {
    const visibleY = frame.filter((dot) => dot.isVisibleLetter).map((dot) => dot.y);
    expect(visibleY.length).toBeGreaterThan(0);
    return { minY: Math.min(...visibleY), maxY: Math.max(...visibleY) };
  });
  for (let frameIndex = 1; frameIndex < ranges.length; frameIndex += 1) {
    expect(ranges[frameIndex - 1]!.maxY).toBeLessThan(ranges[frameIndex]!.minY);
  }
}

function expectEveryFrameIsRequired(frames: BioPictureFrames): void {
  const retainedDotIndexes = new Set(
    frames[0]!.flatMap((dot, dotIndex) => (dot.isLetter ? [dotIndex] : []))
  );
  const visibleDotIndexes = (includedFrames: BioPictureFrames): Set<number> =>
    new Set(
      includedFrames.flatMap((frame) =>
        frame.flatMap((dot, dotIndex) => (dot.isVisibleLetter ? [dotIndex] : []))
      )
    );

  expect(visibleDotIndexes(frames)).toEqual(retainedDotIndexes);
  for (let omittedFrameIndex = 0; omittedFrameIndex < frames.length; omittedFrameIndex += 1) {
    const incompleteFrames = frames.filter((_, frameIndex) => frameIndex !== omittedFrameIndex);
    expect(visibleDotIndexes(incompleteFrames).size).toBeLessThan(retainedDotIndexes.size);
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

  it('shows one stationary horizontal quarter of the glyph per frame', () => {
    const frames = buildHFrames();
    const firstFrame = frames[0]!;

    expect(firstFrame).toHaveLength(frames[1]!.length);
    expect(firstFrame.map((dot) => dot.isLetter)).toEqual(frames[1]!.map((dot) => dot.isLetter));
    expectExclusivePartitions(frames);
    expectStationaryHorizontalPieces(frames);
    expectEveryFrameIsRequired(frames);
    for (const frame of frames) {
      const inactiveLetterDots = frame.filter((dot) => dot.isLetter && !dot.isVisibleLetter);
      const bakedStatic = inactiveLetterDots.flatMap((dot) => {
        const appearance = bioPictureDotAppearance({ dot });
        return appearance ? [{ dot, appearance }] : [];
      });

      expect(bakedStatic.length / inactiveLetterDots.length).toBeGreaterThan(0.4);
      expect(bakedStatic.length / inactiveLetterDots.length).toBeLessThan(0.6);
      expect(
        bakedStatic.every(
          ({ dot, appearance }) =>
            appearance.color === dot.hidden &&
            appearance.size === dot.hiddenSize &&
            appearance.radius === dot.hiddenRadius &&
            appearance.centerX === dot.backgroundX &&
            appearance.centerY === dot.backgroundY
        )
      ).toBe(true);
    }

    const movingInactiveDotIndex = frames[0]!.findIndex(
      (dot, dotIndex) =>
        dot.isLetter &&
        dot.isVisibleBackground &&
        !frames[0]![dotIndex]!.isVisibleLetter &&
        !frames[1]![dotIndex]!.isVisibleLetter
    );
    expect(movingInactiveDotIndex).toBeGreaterThanOrEqual(0);
    const firstAppearance = bioPictureDotAppearance({
      dot: frames[0]![movingInactiveDotIndex]!,
    });
    const secondAppearance = bioPictureDotAppearance({
      dot: frames[1]![movingInactiveDotIndex]!,
    });
    expect(firstAppearance).not.toBeNull();
    expect(secondAppearance).not.toBeNull();
    expect(
      Math.hypot(
        secondAppearance!.centerX - firstAppearance!.centerX,
        secondAppearance!.centerY - firstAppearance!.centerY
      )
    ).toBeGreaterThan(0.5);
  });

  it('moves non-glyph dots across four frames and returns them to their starting positions', () => {
    const frames = buildBackgroundFrames();
    const firstFrame = frames[0]!;

    for (const frame of frames.slice(1)) {
      expect(frame).toHaveLength(firstFrame.length);
      expect(frame.map((dot) => dot.hiddenSize)).toEqual(firstFrame.map((dot) => dot.hiddenSize));
    }
    for (const frame of frames.slice(1, 4)) {
      const movedCount = frame.filter(
        (dot, dotIndex) =>
          Math.hypot(dot.x - firstFrame[dotIndex]!.x, dot.y - firstFrame[dotIndex]!.y) > 0.5
      ).length;
      expect(movedCount / firstFrame.length).toBeGreaterThan(0.95);
    }
    expect(frames[4]!.map(({ x, y }) => ({ x, y }))).toEqual(
      firstFrame.map(({ x, y }) => ({ x, y }))
    );
  });

  it('renders circular purple glyph blocks and dense multi-shade purple background static', () => {
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
    const backgroundDots = buildBioPictureDots({
      letter: 'B',
      variantIndex: 0,
      frameIndex: 0,
      framesPerPrompt: 1,
      width,
      height,
      sampleLetter: () => false,
    });
    const letterSizes = letterDots.map((dot) => dot.size);
    const hiddenSizes = letterDots.map((dot) => dot.hiddenSize);
    const colors = new Set(snow.map((speck) => speck.color));

    expect(snow.length).toBeGreaterThan(210);
    expect(snow.length).toBeLessThan(240);
    expect(backgroundDots.length).toBeGreaterThan(900);
    expect(backgroundDots.length).toBeLessThan(1_000);
    expect(snow.every((speck) => speck.width === speck.height)).toBe(true);
    expect(Math.min(...snow.map((speck) => speck.width))).toBeGreaterThanOrEqual(
      Math.min(...letterSizes) - 1
    );
    expect(Math.max(...snow.map((speck) => speck.width))).toBeLessThanOrEqual(
      Math.max(...letterSizes) + 1
    );
    expect(snow.every((speck) => speck.radius === speck.width / 2)).toBe(true);
    expect(letterDots.every((dot) => dot.radius === dot.size / 2)).toBe(true);
    expect(letterDots.every((dot) => dot.hiddenRadius === dot.hiddenSize / 2)).toBe(true);
    expect(Math.min(...hiddenSizes)).toBeGreaterThan(5);
    expect(Math.max(...hiddenSizes)).toBeLessThan(8);
    expect(colors.size).toBeGreaterThanOrEqual(8);
    const signalColors = new Set<string>(BIO_PICTURE_SIGNAL_COLORS);
    const staticColors = new Set<string>(BIO_PICTURE_STATIC_COLORS);
    expect([...colors].every((color) => staticColors.has(color))).toBe(true);
    expect([...signalColors].every((color) => staticColors.has(color))).toBe(true);
    expect(
      [...colors].every((color) => {
        const red = Number.parseInt(color.slice(1, 3), 16);
        const green = Number.parseInt(color.slice(3, 5), 16);
        const blue = Number.parseInt(color.slice(5, 7), 16);
        return blue > red && red > green;
      })
    ).toBe(true);
  });
});
