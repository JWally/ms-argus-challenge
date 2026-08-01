interface BioPictureDot {
  x: number;
  y: number;
  size: number;
  radius: number;
  hiddenSize: number;
  hiddenRadius: number;
  on: string;
  hidden: string;
  isLetter: boolean;
  isVisibleLetter: boolean;
}

interface BioPictureDotsInput {
  letter: string;
  variantIndex: number;
  frameIndex: number;
  framesPerPrompt: number;
  width: number;
  height: number;
  sampleLetter(x: number, y: number): boolean;
}

interface BioPictureFrameInput {
  dot: BioPictureDot;
}

interface BioPictureDotAppearance {
  color: string;
  size: number;
  radius: number;
}

export const BIO_PICTURE_SIGNAL_COLORS = [
  '#f8fbff',
  '#eaf2ff',
  '#dbeafe',
  '#bfdbfe',
  '#c7ddff',
] as const;
const BG_MUTED = ['#07070c', '#08080e', '#090910', '#08090f', '#07080d'] as const;
const BG_SPOTLIGHT = ['#0b0b14', '#0c0c16', '#0a0b13', '#0d0c17', '#0a0a12'] as const;
export const BIO_PICTURE_BACKGROUND = '#020503';
const BIO_PICTURE_LETTER_SATURATION = 0.95;

function bioPictureFrameOffset(input: {
  frameIndex: number;
  framesPerPrompt: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  if (input.framesPerPrompt <= 1) return { x: 0, y: 0 };
  const phase = ((input.frameIndex % input.framesPerPrompt) / input.framesPerPrompt) * Math.PI * 2;
  const amplitude = Math.max(2, Math.round(Math.min(input.width, input.height) * 0.022));
  return {
    x: Math.round(Math.cos(phase) * amplitude),
    y: Math.round(Math.sin(phase) * amplitude * 0.72),
  };
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(next: () => number, values: readonly T[]): T {
  return values[Math.floor(next() * values.length)] ?? values[0]!;
}

function dotGap(width: number, height: number): number {
  return Math.max(7, Math.round(Math.min(width / 68, height / 30)));
}

export function bioPictureBlockSize(width: number, height: number): number {
  return Math.max(6.4, dotGap(width, height) * 0.76);
}

function dotSize(next: () => number, gap: number, isLetter: boolean): number {
  if (!isLetter) return Math.max(1.6, gap * (0.18 + next() * 0.04));
  return Math.max(6.4, gap * (0.72 + next() * 0.08));
}

function backgroundColor(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  next: () => number;
}): string {
  const distanceRatio =
    Math.sqrt((input.x - input.width / 2) ** 2 + (input.y - input.height / 2) ** 2) /
    Math.sqrt((input.width / 2) ** 2 + (input.height / 2) ** 2);
  if (distanceRatio < 0.68) return pick(input.next, BG_SPOTLIGHT);
  return pick(input.next, BG_MUTED);
}

function buildBioPictureDot(input: {
  picture: BioPictureDotsInput;
  next: () => number;
  gap: number;
  index: number;
  gridX: number;
  gridY: number;
}): BioPictureDot {
  const baseX = input.gridX + (input.next() - 0.5) * input.gap * 0.28;
  const baseY = input.gridY + (input.next() - 0.5) * input.gap * 0.28;
  const samplesLetter = input.picture.sampleLetter(baseX, baseY);
  const letterNext = seededRandom(
    `bio-picture-style:letter-dot:${input.picture.letter}:${input.picture.variantIndex}:${input.index}`
  );
  const isLetter = samplesLetter && letterNext() < BIO_PICTURE_LETTER_SATURATION;
  const offset = bioPictureFrameOffset(input.picture);
  const x = isLetter ? baseX + offset.x : baseX;
  const y = isLetter ? baseY + offset.y : baseY;
  const hidden = backgroundColor({
    x,
    y,
    width: input.picture.width,
    height: input.picture.height,
    next: input.next,
  });
  const hiddenSize = dotSize(input.next, input.gap, false);
  const size = isLetter ? dotSize(letterNext, input.gap, true) : hiddenSize;
  return {
    x,
    y,
    size,
    radius: Math.max(1.5, size * 0.22),
    hiddenSize,
    hiddenRadius: Math.max(1.5, hiddenSize * 0.22),
    on: isLetter ? pick(letterNext, BIO_PICTURE_SIGNAL_COLORS) : hidden,
    hidden,
    isLetter,
    isVisibleLetter: isLetter,
  };
}

function selectFourFrameLetterPartition(
  dots: BioPictureDot[],
  input: Pick<BioPictureDotsInput, 'letter' | 'variantIndex' | 'frameIndex'>
): BioPictureDot[] {
  const letterDots = dots.filter((dot) => dot.isLetter);
  if (letterDots.length === 0) return dots;
  const minX = Math.min(...letterDots.map((dot) => dot.x));
  const maxX = Math.max(...letterDots.map((dot) => dot.x));
  const midpoint = (minX + maxX) / 2;
  const normalizedFrameIndex = ((input.frameIndex % 4) + 4) % 4;
  const showsLeftHalf = normalizedFrameIndex % 2 === 0;
  const showsFirstPartition = normalizedFrameIndex < 2;
  const rankedSideDotIndexes = dots
    .flatMap((dot, dotIndex) => {
      const belongsToSide = showsLeftHalf ? dot.x <= midpoint : dot.x > midpoint;
      if (!dot.isLetter || !belongsToSide) return [];
      const next = seededRandom(
        `bio-picture-style:frame-partition:${input.letter}:${input.variantIndex}:${dotIndex}`
      );
      return [{ dotIndex, rank: next() }];
    })
    .sort((left, right) => left.rank - right.rank);
  const partitionAt = Math.ceil(rankedSideDotIndexes.length / 2);
  const visibleDotIndexes = new Set(
    (showsFirstPartition
      ? rankedSideDotIndexes.slice(0, partitionAt)
      : rankedSideDotIndexes.slice(partitionAt)
    ).map(({ dotIndex }) => dotIndex)
  );

  return dots.map((dot, dotIndex) => ({
    ...dot,
    isVisibleLetter: visibleDotIndexes.has(dotIndex),
  }));
}

function selectVisibleLetterDots(
  dots: BioPictureDot[],
  input: Pick<BioPictureDotsInput, 'letter' | 'variantIndex' | 'frameIndex' | 'framesPerPrompt'>
): BioPictureDot[] {
  if (input.framesPerPrompt <= 1) return dots;

  if (input.framesPerPrompt === 4) {
    return selectFourFrameLetterPartition(dots, input);
  }

  const letterDots = dots.filter((dot) => dot.isLetter);
  if (letterDots.length === 0) return dots;
  const minX = Math.min(...letterDots.map((dot) => dot.x));
  const maxX = Math.max(...letterDots.map((dot) => dot.x));
  const midpoint = (minX + maxX) / 2;
  const showsLeftHalf = input.frameIndex % 2 === 0;
  return dots.map((dot) => ({
    ...dot,
    isVisibleLetter: dot.isLetter && (showsLeftHalf ? dot.x <= midpoint : dot.x > midpoint),
  }));
}

export function buildBioPictureDots(input: BioPictureDotsInput): BioPictureDot[] {
  const next = seededRandom(
    `bio-picture-style:${input.letter}:${input.variantIndex}:${input.width}x${input.height}`
  );
  const gap = dotGap(input.width, input.height);
  const dots: BioPictureDot[] = [];
  for (let y = gap * 0.7; y < input.height - gap * 0.55; y += gap) {
    for (let x = gap * 0.7; x < input.width - gap * 0.55; x += gap) {
      dots.push(
        buildBioPictureDot({
          picture: input,
          next,
          gap,
          index: dots.length,
          gridX: x,
          gridY: y,
        })
      );
    }
  }
  return selectVisibleLetterDots(dots, input);
}

export function bioPictureDotAppearance(input: BioPictureFrameInput): BioPictureDotAppearance {
  if (!input.dot.isVisibleLetter) {
    return {
      color: input.dot.hidden,
      size: input.dot.hiddenSize,
      radius: input.dot.hiddenRadius,
    };
  }
  return { color: input.dot.on, size: input.dot.size, radius: input.dot.radius };
}
