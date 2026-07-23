import { describe, expect, it } from 'vitest';
import { createWebSocketCrypto } from './websocket-crypto.js';

const NOW = 1_900_000_000;
const ROOT_SECRET = Buffer.from('a'.repeat(64));

describe('WebSocket cryptography adapter', () => {
  it('mints and verifies role-bound five-minute bootstrap tokens', async () => {
    const crypto = createWebSocketCrypto(ROOT_SECRET, () => NOW);
    const token = await crypto.mintBootstrapToken('session-1', 'desktop');
    await expect(crypto.verifyBootstrapToken(token)).resolves.toEqual({
      v: 1,
      sessionId: 'session-1',
      role: 'desktop',
      iat: NOW,
      exp: NOW + 300,
    });
  });

  it('rejects modified, expired, and cross-secret bootstrap tokens', async () => {
    const issuer = createWebSocketCrypto(ROOT_SECRET, () => NOW);
    const token = await issuer.mintBootstrapToken('session-1', 'phone');
    await expect(issuer.verifyBootstrapToken(`${token}x`)).resolves.toBeNull();
    await expect(
      createWebSocketCrypto(ROOT_SECRET, () => NOW + 301).verifyBootstrapToken(token)
    ).resolves.toBeNull();
    await expect(
      createWebSocketCrypto(Buffer.from('b'.repeat(64)), () => NOW).verifyBootstrapToken(token)
    ).resolves.toBeNull();
  });

  it('authenticates opaque connection envelopes', async () => {
    const crypto = createWebSocketCrypto(ROOT_SECRET, () => NOW);
    const envelope = {
      v: 1 as const,
      connectionId: 'connection-1',
      sessionId: 'session-1',
      role: 'desktop' as const,
      ip: '203.0.113.8',
      origin: 'https://challenge.example',
      iat: NOW,
    };
    const sealed = await crypto.sealEnvelope(envelope);
    await expect(crypto.openEnvelope(sealed)).resolves.toEqual(envelope);
    await expect(crypto.openEnvelope(`${sealed}x`)).resolves.toBeNull();
  });

  it('derives stable session-specific reveal keys with key separation', async () => {
    const crypto = createWebSocketCrypto(ROOT_SECRET, () => NOW);
    const first = await crypto.getVerdictRevealKey('session-1');
    expect(first).toBe(await crypto.getVerdictRevealKey('session-1'));
    expect(first).not.toBe(await crypto.getVerdictRevealKey('session-2'));
  });
});
