import { describe, expect, it } from 'vitest';
import {
  mintPairToken,
  PAIR_TOKEN_TTL_SECONDS,
  redeemPairToken,
  type PairBlob,
  type SingleUseTokenStore,
} from './pair-token.js';

function memoryStore(): SingleUseTokenStore & { advance(seconds: number): void } {
  let now = 1_000;
  const values = new Map<string, { value: string; expiresAt: number }>();
  return {
    async put(key, value, ttlSeconds) {
      values.set(key, { value, expiresAt: now + ttlSeconds });
    },
    async take(key) {
      const entry = values.get(key);
      values.delete(key);
      return entry && entry.expiresAt >= now ? entry.value : null;
    },
    advance(seconds) {
      now += seconds;
    },
  };
}

const blob: PairBlob = {
  sessionId: 'session-123',
  wsUrl: 'wss://challenge.example/prod',
  e: 'sealed-envelope',
  pt: 'phone-token',
  n: 'nonce-xyz',
  proofRequired: true,
  freshProofRequired: true,
};

describe('pair token', () => {
  it('mints unique URL-safe tokens and redeems the exact blob once', async () => {
    const store = memoryStore();
    const first = await mintPairToken(store, blob);
    const second = await mintPairToken(store, blob);
    expect(first).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(first).not.toBe(second);
    await expect(redeemPairToken(store, first)).resolves.toEqual(blob);
    await expect(redeemPairToken(store, first)).resolves.toBeNull();
  });

  it('rejects malformed, unknown, and expired tokens', async () => {
    const store = memoryStore();
    await expect(redeemPairToken(store, '')).resolves.toBeNull();
    await expect(redeemPairToken(store, 'not-a-real-token')).resolves.toBeNull();
    const token = await mintPairToken(store, blob);
    store.advance(PAIR_TOKEN_TTL_SECONDS + 1);
    await expect(redeemPairToken(store, token)).resolves.toBeNull();
  });
});
