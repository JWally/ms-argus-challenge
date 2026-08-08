import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DrawingBoard } from './DrawingBoard.js';

const phoneStyles = readFileSync(new URL('../../styles/phone.css', import.meta.url), 'utf8');
const pictures = {
  encoding: 'png' as const,
  width: 400,
  height: 180,
  framesPerPrompt: 2,
  frameMs: 50,
  pictures: Array.from({ length: 6 }, () => new Uint8Array([137, 80, 78, 71])),
};

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.040_45 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return (
    0.2126 * channelLuminance(channels[0] ?? 0) +
    0.7152 * channelLuminance(channels[1] ?? 0) +
    0.0722 * channelLuminance(channels[2] ?? 0)
  );
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function colorToken(name: string): string {
  const prefix = `--${name}:`;
  const declaration = phoneStyles
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix));
  const color = declaration
    ?.slice(prefix.length)
    .trim()
    .match(/^#[0-9a-fA-F]{6}/)?.[0];
  if (!color) throw new Error(`missing phone color token ${name}`);
  return color;
}

describe('phone drawing-board presentation', () => {
  it('keeps Pair biometric-captcha structure without an alternate challenge', () => {
    const markup = renderToStaticMarkup(
      createElement(DrawingBoard, {
        pictures,
        expectedLetters: ['A', 'B', 'C'],
        onComplete: vi.fn(),
      })
    );

    expect(markup).toContain('class="bio-draw');
    expect(markup).toContain('ARGUS');
    expect(markup).toContain('PAIR');
    expect(markup).toContain('Handwriting Biometric Captcha');
    expect(markup).toContain('bio-draw-picture-canvas');
    expect(markup.match(/bio-draw-picture-canvas/g)).toHaveLength(1);
    expect(markup).not.toContain('Letter A');
    expect(markup).not.toContain('Draw the letter');
    expect(markup).toContain('Draw the Letter Here');
    expect(markup).toContain('class="drawing-touch-cue"');
    expect(markup).toContain('class="drawing-hint-text"');
    expect(markup).not.toContain('CLICK HERE TO START');
    expect(markup).toContain('Drawing 1 of 3');
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('class="button drawing-submit"');
    expect(markup).toContain('class="button drawing-erase"');
    expect(markup).toContain('CHECK');
    expect(markup).toContain('ERASE');
    expect(markup).toContain('EMNIST CNN');
    expect(markup).toContain('aria-live="polite"');
  });

  it('keeps enabled and disabled drawing actions readable against their backgrounds', () => {
    const pairs = [
      ['draw-next-fg', 'draw-next-bg'],
      ['draw-next-disabled-fg', 'draw-next-disabled-bg'],
      ['draw-erase-fg', 'draw-erase-bg'],
      ['draw-erase-disabled-fg', 'draw-erase-disabled-bg'],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(colorToken(foreground), colorToken(background))).toBeGreaterThanOrEqual(
        4.5
      );
    }
    expect(phoneStyles).toContain('.drawing-actions .button:disabled');
  });

  it('uses the requested white ready treatment and its transparent inverse while disabled', () => {
    expect(colorToken('draw-next-bg')).toBe('#ffffff');
    expect(colorToken('draw-next-fg')).toBe(colorToken('draw-bg'));
    expect(colorToken('draw-next-disabled-bg')).toBe(colorToken('draw-bg'));
    expect(colorToken('draw-next-disabled-fg')).toBe('#ffffff');
    expect(phoneStyles).toMatch(
      /\.drawing-actions \.drawing-submit:disabled \{[^}]*background: transparent;/s
    );
  });

  it('uses a neutral touch cue and keeps the drawing UI scaled for phones', () => {
    expect(phoneStyles).toContain('@keyframes drawing-touch-ring');
    expect(phoneStyles).toContain('--canvas-size: min(calc(100vw - 2rem), 360px);');
    expect(phoneStyles).toMatch(
      /\.drawing-surface \{[^}]*min-height: clamp\(10rem, 28dvh, 14rem\);[^}]*flex: 1;/s
    );
    expect(phoneStyles).toMatch(
      /\.drawing-surface canvas \{[^}]*position: absolute;[^}]*inset: 0;/s
    );
    expect(phoneStyles).toMatch(/\.drawing-hint \{[^}]*display: grid;[^}]*place-items: center;/s);
    expect(phoneStyles).toMatch(/\.drawing-touch-cue \{[^}]*grid-area: 1 \/ 1;/s);
    expect(phoneStyles).toMatch(/\.drawing-actions \{[^}]*position: sticky;[^}]*bottom: 0;/s);
    expect(phoneStyles).toMatch(
      /\.bio-draw-challenge \{[^}]*border: 2px solid var\(--draw-border\);/s
    );
    expect(phoneStyles).toMatch(/\.bio-draw-challenge \{[^}]*aspect-ratio: 20 \/ 9;/s);
  });
});
