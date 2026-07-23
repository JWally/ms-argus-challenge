import { describe, expect, it, vi } from 'vitest';
import type {
  AttestationInput,
  AttestationVerifier,
  DecodedAttestationEnvelope,
} from './attestation-bindings.js';
import { prepareDesktopAttestation } from './desktop-attestation.js';

const session = {
  id: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
  nonce: 'pair_nonce_123456789',
  expiresAt: 1_900_000_300,
  challengeId: 'checkout_action_123456789',
  cpi: 'argus_cpi_live_Example12345.forceauth',
  proofRequired: true,
  freshProofRequired: true,
  hostPreflightRequired: true,
  hostOrigin: 'https://merchant.example',
  verdict: 'pending' as const,
};

function attestation(envelope: string): AttestationInput {
  return { envelope, signature: 'signature', publicKey: 'public-key', keyId: 'key-id' };
}

function decoded(
  payload: Record<string, unknown>,
  scanSessionId: string
): DecodedAttestationEnvelope {
  return {
    v: 1,
    purpose: 'argus-pair-v1',
    payload,
    scanSessionId,
    iat: 1_899_999_999,
    exp: 1_900_000_060,
    keyId: 'key-id',
  };
}

function verifier(): AttestationVerifier {
  const envelopes = new Map([
    [
      'desktop',
      decoded({ role: 'desktop', sessionId: session.id, nonce: session.nonce }, 'argus-desktop-1'),
    ],
    [
      'host',
      decoded(
        {
          role: 'host',
          pairSessionId: session.id,
          challengeId: session.challengeId,
          cpi: session.cpi,
          origin: session.hostOrigin,
          nonce: 'host_scan_nonce_123456789',
        },
        'argus-host-1'
      ),
    ],
  ]);
  return {
    verify(value) {
      const valueDecoded = envelopes.get(value.envelope);
      return valueDecoded ? { ok: true, decoded: valueDecoded } : { ok: false, reason: 'unknown' };
    },
  };
}

function body(includeHost = true) {
  return {
    argusSessionId: 'argus-desktop-1',
    attestation: attestation('desktop'),
    ...(includeHost
      ? {
          hostPreflight: {
            argusSessionId: 'argus-host-1',
            attestation: attestation('host'),
          },
        }
      : {}),
  };
}

describe('desktop attestation preparation', () => {
  it('validates and claims host then desktop evidence for embedded sessions', async () => {
    const claim = vi.fn().mockResolvedValue({ ok: true as const });
    const result = await prepareDesktopAttestation(body(), session, {
      verifier: verifier(),
      claimArgusSession: claim,
      nowEpochSeconds: () => 1_900_000_000,
    });
    expect(result).toMatchObject({
      ok: true,
      stored: {
        argusSessionId: 'argus-desktop-1',
        receivedAt: 1_900_000_000,
        hostAttestation: {
          argusSessionId: 'argus-host-1',
          origin: 'https://merchant.example',
        },
      },
    });
    expect(claim).toHaveBeenNthCalledWith(1, 'argus-host-1', session.id, 'host');
    expect(claim).toHaveBeenNthCalledWith(2, 'argus-desktop-1', session.id, 'desktop');
  });

  it('fails closed when required host evidence is absent', async () => {
    const claim = vi.fn();
    await expect(
      prepareDesktopAttestation(body(false), session, {
        verifier: verifier(),
        claimArgusSession: claim,
        nowEpochSeconds: () => 1_900_000_000,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      body: { error: 'host_preflight_invalid' },
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it('allows direct sessions without host evidence', async () => {
    const claim = vi.fn().mockResolvedValue({ ok: true as const });
    const direct = { ...session, hostPreflightRequired: false };
    const result = await prepareDesktopAttestation(body(false), direct, {
      verifier: verifier(),
      claimArgusSession: claim,
      nowEpochSeconds: () => 1_900_000_000,
    });
    expect(result).toMatchObject({ ok: true, stored: { argusSessionId: 'argus-desktop-1' } });
    if (result.ok) expect(result.stored).not.toHaveProperty('hostAttestation');
  });
});
