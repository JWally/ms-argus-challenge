import { describe, expect, it } from 'vitest';
import { measuredEmbedHeight } from './embed-size.js';

describe('measuredEmbedHeight', () => {
  it('reports the border-box height instead of the smaller scroll height', () => {
    const element = {
      scrollHeight: 436,
      getBoundingClientRect: () => ({ height: 438 }),
    };

    expect(measuredEmbedHeight(element)).toBe(438);
  });

  it('rounds fractional browser measurements up', () => {
    const element = { getBoundingClientRect: () => ({ height: 437.25 }) };

    expect(measuredEmbedHeight(element)).toBe(438);
  });
});
