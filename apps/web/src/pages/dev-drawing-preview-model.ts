export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');
export const WIDTH = 600;
export const HEIGHT = 270;
export const FRAMES_PER_PROMPT = 4;
export const FRAME_MS = 30;

interface LetterMaskStyle {
  fontSizeScale: number;
  scaleX: number;
  scaleY: number;
}

const DEFAULT_MASK_STYLE: LetterMaskStyle = {
  fontSizeScale: 1,
  scaleX: 1.12,
  scaleY: 1,
};

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

export function seededUnit(seed: string, salt: string): number {
  return seededRandom(`${seed}:${salt}`)();
}

export function variantSeed(letter: string, variantIndex: number): string {
  return `drawing-picture:${letter}:${variantIndex}`;
}

export function letterMaskStyle(letter: string): LetterMaskStyle {
  if (letter === 'B') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 0.98,
      scaleX: 1.19,
      scaleY: 1.02,
    };
  }
  if (letter === 'R') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 0.98,
      scaleX: 1.24,
      scaleY: 1.02,
    };
  }
  if (letter === 'K') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 0.98,
      scaleX: 1.18,
      scaleY: 1.02,
    };
  }
  if (letter === 'J') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 1.02,
      scaleX: 1.22,
      scaleY: 1.04,
    };
  }
  return DEFAULT_MASK_STYLE;
}
