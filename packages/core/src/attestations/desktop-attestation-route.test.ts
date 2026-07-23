import { describe, expect, it, vi } from 'vitest';
import { createDesktopAttestationHandler } from './desktop-attestation-route.js';

const SESSION_ID = '4f4cf495-a98b-4b76-9099-8ad59dc85ccb';
const session = {
  id: SESSION_ID,
  nonce: 'nonce-1',
  expiresAt: 1_900_000_300,
  challengeId: 'checkout_action_123456789',
  cpi: 'argus_cpi_test_Example12345',
  proofRequired: false,
  freshProofRequired: false,
  hostPreflightRequired: false,
  verdict: 'pending' as const,
};
const stored = {
  envelope: 'envelope',
  signature: 'signature',
  publicKey: 'public-key',
  keyId: 'key-id',
  argusSessionId: 'argus-1',
  receivedAt: 1_900_000_000,
  envelopeDecoded: {
    v: 1,
    purpose: 'argus-pair-v1',
    payload: {},
    iat: 1,
    exp: 2,
    keyId: 'key-id',
  },
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadSession: vi.fn().mockResolvedValue(session),
    prepare: vi.fn().mockResolvedValue({ ok: true, stored }),
    store: vi.fn().mockResolvedValue(true),
    classifyDesktop: vi.fn().mockResolvedValue({ clean: true, summary: { score: 0 } }),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('desktop attestation route', () => {
  it('commits before returning an optimistic projection summary', async () => {
    const deps = dependencies();
    await expect(createDesktopAttestationHandler(deps)({}, SESSION_ID)).resolves.toEqual({
      status: 200,
      body: { ok: true, clean: true, summary: { score: 0 } },
    });
    expect(deps.store).toHaveBeenCalledWith(SESSION_ID, stored);
  });

  it.each([
    ['missing', { loadSession: vi.fn().mockResolvedValue(null) }, 404, 'session_not_found'],
    [
      'occupied',
      { loadSession: vi.fn().mockResolvedValue({ ...session, desktopAttestation: stored }) },
      409,
      'already_attested',
    ],
    ['lost race', { store: vi.fn().mockResolvedValue(false) }, 409, 'already_attested'],
  ])('rejects %s session state', async (_label, overrides, status, error) => {
    await expect(
      createDesktopAttestationHandler(dependencies(overrides))({}, SESSION_ID)
    ).resolves.toEqual({
      status,
      body: { error },
    });
  });

  it('keeps classification best-effort after durable commit', async () => {
    const warn = vi.fn();
    await expect(
      createDesktopAttestationHandler(
        dependencies({ classifyDesktop: vi.fn().mockRejectedValue(new Error('not ready')), warn })
      )({}, SESSION_ID)
    ).resolves.toEqual({ status: 200, body: { ok: true, clean: false, summary: null } });
    expect(warn).toHaveBeenCalledWith(
      '[challenge] desktop-attest optimistic classify failed: not ready'
    );
  });
});
