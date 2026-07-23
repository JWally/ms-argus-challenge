import { describe, expect, it } from 'vitest';
import { embedPresentation } from './embed-presentation.js';

describe('Pair-compatible embed presentation', () => {
  it.each([
    [
      { status: 'Scan with your phone', completion: null },
      {
        phase: 'scanning',
        title: 'Scan with your phone',
        instruction: "Open your phone's camera and point it at the code.",
        trackStatus: 'WAITING FOR PHONE',
      },
    ],
    [
      { status: 'Phone connected', completion: null },
      {
        phase: 'pairing',
        title: 'Phone connected',
        instruction: 'Finishing check...',
        trackStatus: 'PHONE CONNECTED',
      },
    ],
    [
      { status: 'Phone connected', completion: 'paired' as const },
      {
        phase: 'verified',
        title: 'Verified',
        instruction: "You're all set",
        trackStatus: 'CHECK COMPLETE',
      },
    ],
    [
      { status: 'Phone connected', completion: 'failed' as const },
      {
        phase: 'failed',
        title: "Couldn't verify",
        instruction: 'Try again on a trusted network',
        trackStatus: 'CHECK ENDED',
      },
    ],
  ])('maps transport state to a stable visual state', (input, expected) => {
    expect(embedPresentation(input)).toEqual(expected);
  });
});
