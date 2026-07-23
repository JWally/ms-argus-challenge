import { describe, expect, it } from 'vitest';
import {
  FIXED_VERDICT_PLAINTEXT_BYTES,
  decodeVerdictRevealKey,
  encodeVerdictRevealKey,
  openFixedVerdictEnvelope,
  sealFixedVerdictEnvelope,
} from './fixed-envelope.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const key = new Uint8Array(32).fill(7);

describe('fixed verdict envelope', () => {
  it('round trips while hiding the payload length', async () => {
    const short = await sealFixedVerdictEnvelope(key, SESSION_ID, {
      kind: 'desktop-verdict',
      verdict: 'paired',
      reason: null,
      annotations: {},
    });
    const long = await sealFixedVerdictEnvelope(key, SESSION_ID, {
      kind: 'desktop-verdict',
      verdict: 'failed',
      reason: 'projection_lookup_failed',
      annotations: { detail: 'x'.repeat(2_000) },
    });
    expect(short.paddedBytes).toBe(FIXED_VERDICT_PLAINTEXT_BYTES);
    expect(short.ciphertext).toHaveLength(long.ciphertext.length);
    await expect(openFixedVerdictEnvelope(key, SESSION_ID, short)).resolves.toMatchObject({
      verdict: 'paired',
    });
  });

  it('binds ciphertext to the session and rejects wrong keys', async () => {
    const sealed = await sealFixedVerdictEnvelope(key, SESSION_ID, {
      kind: 'phone-state',
      verdict: 'paired',
      nextDeviceTrust: null,
    });
    await expect(openFixedVerdictEnvelope(key, 'other-session', sealed)).rejects.toThrow();
    await expect(
      openFixedVerdictEnvelope(new Uint8Array(32).fill(8), SESSION_ID, sealed)
    ).rejects.toThrow();
  });

  it('round trips only 32-byte reveal keys', () => {
    expect(decodeVerdictRevealKey(encodeVerdictRevealKey(key))).toEqual(key);
    expect(() => encodeVerdictRevealKey(new Uint8Array(31))).toThrow('invalid verdict reveal key');
  });
});
