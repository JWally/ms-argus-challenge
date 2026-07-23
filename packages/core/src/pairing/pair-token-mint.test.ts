import { describe, expect, it, vi } from 'vitest';
import { createPairTokenMintHandler, type PairTokenMintDependencies } from './pair-token-mint.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const body = {
  wsUrl: 'wss://socket.example',
  e: 'sealed-desktop-state',
  pt: 'phone-token',
  n: 'pair-nonce',
  cPub: 'client-public-key',
  workerUrl: 'https://challenge.example/qr-worker.js',
  workerSha256: `sha256-${'A'.repeat(43)}`,
  debug: true,
};

function dependencies(overrides: Partial<PairTokenMintDependencies> = {}) {
  return {
    authenticateParticipant: vi.fn().mockResolvedValue(true),
    loadSession: vi.fn().mockResolvedValue({ proofRequired: true, freshProofRequired: false }),
    verifyWorkerIntegrity: vi.fn().mockResolvedValue({ ok: true }),
    mintToken: vi.fn().mockResolvedValue('one-time-token'),
    sealQr: vi.fn().mockResolvedValue({ kind: 'png-frames', enc: 'sealed' }),
    pairOrigin: 'https://challenge.example',
    proofRequiredByDefault: false,
    warn: vi.fn(),
    ...overrides,
  } satisfies PairTokenMintDependencies;
}

describe('pair-token mint route', () => {
  it('authenticates before parsing or loading the session', async () => {
    const deps = dependencies({ authenticateParticipant: vi.fn().mockResolvedValue(false) });
    await expect(createPairTokenMintHandler(deps)({}, SESSION_ID, {})).resolves.toEqual({
      status: 401,
      body: { error: 'pair_token_unauthorized' },
    });
    expect(deps.loadSession).not.toHaveBeenCalled();
  });

  it('rejects missing blobs and untrusted worker bytes', async () => {
    const deps = dependencies();
    await expect(createPairTokenMintHandler(deps)({}, SESSION_ID, {})).resolves.toEqual({
      status: 400,
      body: { error: 'invalid_pair_blob' },
    });
    const compromised = dependencies({
      verifyWorkerIntegrity: vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        error: 'worker_integrity_invalid',
        reason: 'hash_mismatch',
      }),
    });
    await expect(createPairTokenMintHandler(compromised)({}, SESSION_ID, body)).resolves.toEqual({
      status: 400,
      body: { error: 'worker_integrity_invalid', reason: 'hash_mismatch' },
    });
  });

  it('uses server-owned assurance flags and returns only encrypted QR data', async () => {
    const deps = dependencies();
    await expect(createPairTokenMintHandler(deps)({}, SESSION_ID, body)).resolves.toEqual({
      status: 200,
      body: { kind: 'png-frames', enc: 'sealed' },
    });
    expect(deps.mintToken).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      wsUrl: body.wsUrl,
      e: body.e,
      pt: body.pt,
      n: body.n,
      proofRequired: true,
      freshProofRequired: false,
    });
    expect(deps.sealQr).toHaveBeenCalledWith({
      pairOrigin: 'https://challenge.example',
      token: 'one-time-token',
      suffix: '?debug=true',
      clientPublicKey: body.cPub,
      compression: 'none',
    });
  });

  it('refuses plaintext fallback when the client key is invalid', async () => {
    const deps = dependencies({ sealQr: vi.fn().mockRejectedValue(new Error('bad key')) });
    await expect(createPairTokenMintHandler(deps)({}, SESSION_ID, body)).resolves.toEqual({
      status: 400,
      body: { error: 'bad_client_pubkey' },
    });
    expect(deps.warn).toHaveBeenCalled();
  });
});
