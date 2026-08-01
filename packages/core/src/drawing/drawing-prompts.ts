import { createHash } from 'node:crypto';

export const SERVER_DRAWING_PROMPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SERVER_DRAWING_PROMPT_COUNT = 3;

export interface ServerDrawingPrompt {
  letter: string;
  seed: string;
}

export interface DrawingPromptSession {
  sessionId: string;
  drawingPromptSeed: string;
}

function promptDigest(input: DrawingPromptSession, index: number): Buffer {
  return createHash('sha256')
    .update('argus-server-drawing-prompt-v1')
    .update('\0')
    .update(input.sessionId)
    .update('\0')
    .update(input.drawingPromptSeed)
    .update('\0')
    .update(String(index))
    .digest();
}

export function drawingPromptsForSession(input: DrawingPromptSession): ServerDrawingPrompt[] {
  return Array.from({ length: SERVER_DRAWING_PROMPT_COUNT }, (_, index) => {
    const digest = promptDigest(input, index);
    const letterIndex = (digest[0] ?? 0) % SERVER_DRAWING_PROMPT_ALPHABET.length;
    return {
      letter: SERVER_DRAWING_PROMPT_ALPHABET[letterIndex] ?? 'A',
      seed: digest.toString('base64url'),
    };
  });
}
