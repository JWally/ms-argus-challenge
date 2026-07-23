const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const REQUIRED_DRAWINGS = 3;

interface DrawingPrompt {
  letter: string;
  seed: number;
}

export function drawingChallenge(nonce: string, index: number): DrawingPrompt {
  let seed = 2_166_136_261;
  for (const character of `${nonce}:${index}`) {
    seed ^= character.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16_777_619);
  }
  seed >>>= 0;
  return { letter: LETTERS[seed % LETTERS.length] ?? 'A', seed };
}

export function shouldShowDrawingInstructions(index: number, hasStarted: boolean): boolean {
  return index === 0 && !hasStarted;
}
