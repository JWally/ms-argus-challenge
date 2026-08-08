import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('loader public surface', () => {
  it('keeps the current global methods and data-attribute contract', async () => {
    const source = await readFile(new URL('./loader.ts', import.meta.url), 'utf8');
    expect(source).toContain('window.argusCaptcha = api');
    expect(source).toContain('startMobileSso');
    expect(source).toContain("getAttribute('data-cpi')");
    expect(source).toContain("getAttribute('data-challenge-id')");
    expect(source).toContain("querySelectorAll('.argus-captcha')");
  });

  it('clips the iframe viewport to the rounded challenge card', async () => {
    const source = await readFile(new URL('./loader.ts', import.meta.url), 'utf8');

    expect(source).toContain('border-radius:${DEFAULT_WIDGET_BORDER_RADIUS}');
  });
});
