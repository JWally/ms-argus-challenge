interface BioPictureDot {
  x: number;
  y: number;
  backgroundX: number;
  backgroundY: number;
  size: number;
  radius: number;
  hiddenSize: number;
  hiddenRadius: number;
  on: string;
  hidden: string;
  isLetter: boolean;
  isGlyphArea: boolean;
  isVisibleBackground: boolean;
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
  centerX: number;
  centerY: number;
  color: string;
  size: number;
  radius: number;
}

export const BIO_PICTURE_SIGNAL_COLORS = [
  '#c69afe',
  '#c091fc',
  '#ba88fa',
  '#b580f7',
  '#af78f4',
] as const;
const BG_MUTED = ['#462878', '#4d2c83', '#53308c', '#593496', '#6039a1'] as const;
const BG_SPOTLIGHT = ['#6840aa', '#7046b5', '#784cc0', '#8052c8', '#7449ba'] as const;
export const BIO_PICTURE_BACKGROUND = '#020503';
const BIO_PICTURE_LETTER_SATURATION = 0.95;
const BIO_PICTURE_BACKGROUND_DOT_SATURATION = 0.5;

function bioPictureFrameOffset(input: {
  frameIndex: number;
  framesPerPrompt: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  if (input.framesPerPrompt <= 1 || input.framesPerPrompt === 4) return { x: 0, y: 0 };
  const phase = ((input.frameIndex % input.framesPerPrompt) / input.framesPerPrompt) * Math.PI * 2;
  const amplitude = Math.max(2, Math.round(Math.min(input.width, input.height) * 0.022));
  return {
    x: Math.round(Math.cos(phase) * amplitude),
    y: Math.round(Math.sin(phase) * amplitude * 0.72),
  };
}

function bioPictureBackgroundFrameOffset(input: {
  letter: string;
  variantIndex: number;
  dotIndex: number;
  frameIndex: number;
  framesPerPrompt: number;
  gap: number;
}): { x: number; y: number } {
  if (input.framesPerPrompt <= 1) return { x: 0, y: 0 };
  const next = seededRandom(
    `bio-picture-style:background-motion:${input.letter}:${input.variantIndex}:${input.dotIndex}`
  );
  const phaseOffset = next() * Math.PI * 2;
  const amplitude = input.gap * (0.32 + next() * 0.18);
  const normalizedFrameIndex =
    ((input.frameIndex % input.framesPerPrompt) + input.framesPerPrompt) % input.framesPerPrompt;
  const phase = phaseOffset + (normalizedFrameIndex / input.framesPerPrompt) * Math.PI * 2;
  return {
    x: Math.cos(phase) * amplitude,
    y: Math.sin(phase) * amplitude * 0.76,
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
  if (!isLetter) return Math.max(5.2, gap * (0.58 + next() * 0.26));
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
  const letterOffset = bioPictureFrameOffset(input.picture);
  const backgroundOffset = bioPictureBackgroundFrameOffset({
    letter: input.picture.letter,
    variantIndex: input.picture.variantIndex,
    dotIndex: input.index,
    frameIndex: input.picture.frameIndex,
    framesPerPrompt: input.picture.framesPerPrompt,
    gap: input.gap,
  });
  const x = baseX + (isLetter ? letterOffset.x : backgroundOffset.x);
  const y = baseY + (isLetter ? letterOffset.y : backgroundOffset.y);
  const backgroundX = baseX + backgroundOffset.x;
  const backgroundY = baseY + backgroundOffset.y;
  const hidden = backgroundColor({
    x: backgroundX,
    y: backgroundY,
    width: input.picture.width,
    height: input.picture.height,
    next: input.next,
  });
  const hiddenSize = dotSize(input.next, input.gap, false);
  const size = isLetter ? dotSize(letterNext, input.gap, true) : hiddenSize;
  return {
    x,
    y,
    backgroundX,
    backgroundY,
    size,
    radius: size / 2,
    hiddenSize,
    hiddenRadius: hiddenSize / 2,
    on: isLetter ? pick(letterNext, BIO_PICTURE_SIGNAL_COLORS) : hidden,
    hidden,
    isLetter,
    isGlyphArea: samplesLetter,
    isVisibleBackground:
      seededRandom(
        `bio-picture-style:background-dot:${input.picture.letter}:${input.picture.variantIndex}:${input.index}`
      )() < BIO_PICTURE_BACKGROUND_DOT_SATURATION,
    isVisibleLetter: isLetter,
  };
}

function retainBackgroundDots(dots: BioPictureDot[]): BioPictureDot[] {
  return dots.filter((dot) => {
    if (dot.isGlyphArea) return true;
    return dot.isVisibleBackground;
  });
}

function selectFourFrameLetterPartition(
  dots: BioPictureDot[],
  input: Pick<BioPictureDotsInput, 'letter' | 'variantIndex' | 'frameIndex'>
): BioPictureDot[] {
  const letterDots = dots.filter((dot) => dot.isLetter);
  if (letterDots.length === 0) return dots;
  const minY = Math.min(...letterDots.map((dot) => dot.y));
  const maxY = Math.max(...letterDots.map((dot) => dot.y));
  const glyphHeight = Math.max(1, maxY - minY);
  const normalizedFrameIndex = ((input.frameIndex % 4) + 4) % 4;

  return dots.map((dot) => ({
    ...dot,
    isVisibleLetter:
      dot.isLetter &&
      Math.min(3, Math.floor(((dot.y - minY) / glyphHeight) * 4)) === normalizedFrameIndex,
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
  return selectVisibleLetterDots(retainBackgroundDots(dots), input);
}

export function bioPictureDotAppearance(
  input: BioPictureFrameInput
): BioPictureDotAppearance | null {
  if (input.dot.isVisibleLetter) {
    return {
      centerX: input.dot.x,
      centerY: input.dot.y,
      color: input.dot.on,
      size: input.dot.size,
      radius: input.dot.radius,
    };
  }
  if (!input.dot.isVisibleBackground) return null;
  return {
    centerX: input.dot.backgroundX,
    centerY: input.dot.backgroundY,
    color: input.dot.hidden,
    size: input.dot.hiddenSize,
    radius: input.dot.hiddenRadius,
  };
}
