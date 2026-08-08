import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmbedSeal } from './EmbedIcons.js';

describe('EmbedSeal', () => {
  it('uses a clock rather than a failure cross when the challenge expires', () => {
    const markup = renderToStaticMarkup(createElement(EmbedSeal, { phase: 'expired' }));

    expect(markup).toContain('M24 16v8l5 3');
    expect(markup).not.toContain('M19 19l10 10M29 19l-10 10');
  });
});
