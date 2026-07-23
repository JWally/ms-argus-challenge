import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DrawingBoard } from './DrawingBoard.js';

describe('phone drawing-board presentation', () => {
  it('keeps Pair biometric-captcha structure without an alternate challenge', () => {
    const markup = renderToStaticMarkup(
      createElement(DrawingBoard, {
        nonce: 'phone-drawing-contract-nonce',
        onComplete: vi.fn(),
      })
    );

    expect(markup).toContain('class="bio-draw');
    expect(markup).toContain('ARGUS');
    expect(markup).toContain('PAIR');
    expect(markup).toContain('Handwriting Biometric Captcha');
    expect(markup).toContain('bio-draw-dot-canvas');
    expect(markup).toContain('Draw the Character You See Above');
    expect(markup).toContain('Drawing 1 of 3');
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('Next');
    expect(markup).toContain('Erase');
  });
});
