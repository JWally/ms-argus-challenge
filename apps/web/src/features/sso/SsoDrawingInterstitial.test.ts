import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  SsoDrawingInterstitial,
  ssoDrawingActionLabel,
  ssoDrawingPrompt,
} from './SsoDrawingInterstitial.js';

const ssoStyles = readFileSync(new URL('../../styles/sso.css', import.meta.url), 'utf8');

describe('SSO drawing interstitial', () => {
  it('assigns one letter to each secure-check page', () => {
    expect([1, 2, 3].map((step) => ssoDrawingPrompt(step as 1 | 2 | 3))).toEqual(['A', 'R', 'G']);
  });

  it('uses next for the first two drawings and done for the final drawing', () => {
    expect(ssoDrawingActionLabel(1, true)).toBe('NEXT');
    expect(ssoDrawingActionLabel(2, true)).toBe('NEXT');
    expect(ssoDrawingActionLabel(3, true)).toBe('DONE');
    expect(ssoDrawingActionLabel(3, false)).toBe('CHECK');
  });

  it('fills the secure-check page with a visible single-letter drawing task', () => {
    const markup = renderToStaticMarkup(
      createElement(SsoDrawingInterstitial, {
        step: 2,
        ready: false,
        onContinue: vi.fn(),
      })
    );

    expect(markup).toContain('Secure session check');
    expect(markup).toContain('Step 2 of 3');
    expect(markup).toContain('DRAW');
    expect(markup).toContain('>R<');
    expect(markup).toContain('Draw the letter R');
    expect(markup).toContain('CHECK');
    expect(markup).toContain('HANDWRITING // EMNIST CNN');
    expect(markup).toContain('Secure check in progress');
    expect(markup).not.toContain('running in the background');
    expect(markup).not.toContain('sso-stage-value');
  });

  it('keeps the requested letter centered independently from the DRAW label', () => {
    expect(ssoStyles).toMatch(
      /\.sso-drawing-prompt \{[^}]*position: relative;[^}]*display: grid;[^}]*place-items: center;/s
    );
    expect(ssoStyles).toMatch(/\.sso-drawing-prompt span \{[^}]*position: absolute;[^}]*left:/s);
    expect(ssoStyles).toMatch(
      /\.sso-drawing-footer \.drawing-actions \{[^}]*display: grid;[^}]*grid-template-columns: 1fr;/s
    );
    expect(ssoStyles).toMatch(
      /\.sso-drawing-footer \.drawing-actions \.button \{[^}]*width: 100%;[^}]*background: #fff;[^}]*color: var\(--sso-blue-deep\);/s
    );
  });
});
