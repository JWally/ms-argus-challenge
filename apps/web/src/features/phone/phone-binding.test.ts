import { describe, expect, it } from 'vitest';
import { pairBlobToFragment, readPhoneBinding } from './phone-binding.js';

const blob = {
  sessionId: '9af6236b-8224-43ab-9ee1-faa41f37da67',
  wsUrl: 'wss://socket.example/dev',
  e: 'desktop-envelope',
  pt: 'phone-token',
  n: 'nonce-value-123456',
  proofRequired: true,
  freshProofRequired: false,
};

describe('phone binding', () => {
  it('round trips routing material through the URL fragment', () => {
    expect(readPhoneBinding(`#${pairBlobToFragment(blob)}`)).toEqual({
      wsUrl: blob.wsUrl,
      desktopEnvelope: blob.e,
      phoneToken: blob.pt,
      nonce: blob.n,
      proofRequired: true,
      freshProofRequired: false,
    });
  });

  it('fails closed when authenticated routing material is absent', () => {
    expect(() => readPhoneBinding('#n=nonce-value-123456')).toThrow('pair_binding_invalid');
  });
});
