import { describe, expect, it } from 'vitest';
import { drawingPromptsForSession, SERVER_DRAWING_PROMPT_COUNT } from './drawing-prompts.js';

describe('server-owned drawing prompts', () => {
  it('derives a stable three-letter prompt sequence from the server-only seed', () => {
    const first = drawingPromptsForSession({
      sessionId: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
      drawingPromptSeed: 'server-secret-drawing-seed',
    });
    const second = drawingPromptsForSession({
      sessionId: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
      drawingPromptSeed: 'server-secret-drawing-seed',
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(SERVER_DRAWING_PROMPT_COUNT);
    expect(new Set(first.map(({ seed }) => seed)).size).toBe(SERVER_DRAWING_PROMPT_COUNT);
    expect(first.every(({ letter }) => !/[IO]/.test(letter))).toBe(true);
  });

  it('does not use the client-visible nonce as prompt entropy', () => {
    expect(
      drawingPromptsForSession({
        sessionId: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
        drawingPromptSeed: 'one-secret',
      })
    ).not.toEqual(
      drawingPromptsForSession({
        sessionId: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
        drawingPromptSeed: 'another-secret',
      })
    );
  });
});
