import { describe, expect, it, vi } from 'vitest';
import type { SealedVerdictEnvelope } from '@argus-challenge/contracts/verdicts/fixed-envelope';
import { createVerdictGate } from './verdict-gate.js';

const envelope = {
  v: 1,
  algorithm: 'A256GCM',
  paddedBytes: 16_384,
  iv: 'iv',
  ciphertext: 'ciphertext',
} satisfies SealedVerdictEnvelope;

describe('desktop verdict gate', () => {
  it.each(['sealed-first', 'key-first'] as const)(
    'opens only when both parts arrive: %s',
    async (order) => {
      const open = vi.fn(async () => ({
        kind: 'desktop-verdict' as const,
        verdict: 'paired' as const,
        reason: null,
        annotations: { tested: true },
      }));
      const gate = createVerdictGate('session', open, () => new Uint8Array(32));
      if (order === 'sealed-first') {
        await gate.receiveEnvelope(envelope);
        await gate.receiveKey('key');
      } else {
        await gate.receiveKey('key');
        await gate.receiveEnvelope(envelope);
      }
      await expect(gate.result).resolves.toMatchObject({ verdict: 'paired' });
      expect(open).toHaveBeenCalledOnce();
    }
  );

  it('fails closed on the wrong payload kind', async () => {
    const open = vi.fn(async () => ({
      kind: 'phone-state' as const,
      verdict: 'paired' as const,
      nextDeviceTrust: null,
    }));
    const gate = createVerdictGate('session', open, () => new Uint8Array(32));
    await gate.receiveEnvelope(envelope);
    await gate.receiveKey('key');
    await expect(gate.result).rejects.toThrow('unexpected_verdict_payload');
  });
});
