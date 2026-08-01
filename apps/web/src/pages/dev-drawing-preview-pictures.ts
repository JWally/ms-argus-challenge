import type { RenderedDrawingPictures } from '../features/drawing/drawing-picture-protocol.js';
import {
  ALPHABET,
  FRAME_MS,
  FRAMES_PER_PROMPT,
  HEIGHT,
  WIDTH,
  seededRandom,
} from './dev-drawing-preview-model.js';
import { framesForLetter } from './dev-drawing-preview-renderer.js';

export async function picturesForLetters(
  letters: string[],
  previewSeed: string
): Promise<RenderedDrawingPictures> {
  const pictures: Uint8Array[] = [];
  for (const letter of letters) pictures.push(...(await framesForLetter(letter, previewSeed)));
  return {
    encoding: 'png',
    width: WIDTH,
    height: HEIGHT,
    framesPerPrompt: FRAMES_PER_PROMPT,
    frameMs: FRAME_MS,
    pictures,
  };
}

export function randomLetters(seed: string): string[] {
  const next = seededRandom(seed);
  return Array.from({ length: 3 }, () => ALPHABET[Math.floor(next() * ALPHABET.length)] ?? 'A');
}
