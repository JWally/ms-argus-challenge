import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SsoProofActions } from './SsoProofActions.js';

describe('SSO passkey choices', () => {
  it('offers credential discovery before explicit registration without a local hint', () => {
    const markup = renderToStaticMarkup(
      createElement(SsoProofActions, {
        busy: false,
        googleConfigured: false,
        onChoose: vi.fn(),
      })
    );

    expect(markup).toContain('Use passkey');
    expect(markup).toContain('Create passkey');
  });
});
