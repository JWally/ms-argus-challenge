import { merchantProjection } from '@argus-challenge/testkit';
import { describe, expect, it, vi } from 'vitest';
import type { AttestationInput } from '../attestations/attestation-bindings.js';
import { challengeSsoSession, type SsoChallengeDependencies } from './challenge.js';
import type { SsoSession } from './types.js';

const NOW = 1_900_000_000;
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CPI = 'argus_cpi_test_Example12345.forceauth';
const attestation: AttestationInput = {
  envelope: 'envelope',
  signature: 'signature',
  publicKey: 'public-key',
  keyId: 'device-key',
};
const phoneProjection = merchantProjection({
  identification: {
    crypto_device_id: '43a46f1d08',
    crypto_verified: true,
    browserDetails: {
      browserName: 'Mobile Safari',
      browserVersion: '26',
      device: 'mobile',
      os: 'iOS',
      userAgent: 'Mozilla/5.0 (iPhone) Mobile',
    },
  },
});
const startProfile = {
  argusSessionId: 'start-scan',
  keyId: 'device-key',
  ip: '203.0.113.10',
  asnName: 'Example ASN',
  country: 'US',
  city: 'Dallas',
  score: 0,
  isPhone: true,
  isProxy: false,
  isDatacenter: false,
  isVpn: false,
  projectionDeviceBound: true,
};

function session(overrides: Partial<SsoSession> = {}): SsoSession {
  return {
    id: SESSION_ID,
    nonce: 'nonce',
    merchantSessionId: 'merchant-session',
    cpi: CPI,
    proofRequired: true,
    freshProofRequired: true,
    startProfile,
    verdict: 'pending',
    expiresAt: NOW + 300,
    ...overrides,
  };
}

function dependencies(overrides: Partial<SsoChallengeDependencies> = {}): SsoChallengeDependencies {
  return {
    loadSession: vi.fn().mockResolvedValue(session()),
    validateAttestation: vi.fn(() => ({ ok: true as const, attestation })),
    fetchProjection: vi.fn().mockResolvedValue(phoneProjection),
    mintReturnCode: () => ({ value: 'return-code', expiresAt: NOW + 90 }),
    recordChallenge: vi.fn().mockResolvedValue(true),
    nowEpochSeconds: () => NOW,
    ...overrides,
  };
}

const body = { argusSessionId: 'challenge-scan', attestation };

describe('SSO challenge leg', () => {
  it('rejects missing, expired, and already-completed sessions', async () => {
    await expect(
      challengeSsoSession(
        SESSION_ID,
        body,
        dependencies({ loadSession: vi.fn().mockResolvedValue(null) })
      )
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      challengeSsoSession(
        SESSION_ID,
        body,
        dependencies({ loadSession: vi.fn().mockResolvedValue(session({ expiresAt: NOW - 1 })) })
      )
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      challengeSsoSession(
        SESSION_ID,
        body,
        dependencies({
          loadSession: vi.fn().mockResolvedValue(session({ challengeProfile: startProfile })),
        })
      )
    ).resolves.toMatchObject({
      status: 409,
      body: { error: 'sso_challenge_already_completed' },
    });
  });

  it('preserves attestation failures and requires a phone projection', async () => {
    await expect(
      challengeSsoSession(
        SESSION_ID,
        body,
        dependencies({
          validateAttestation: vi.fn(() => ({
            ok: false as const,
            status: 400,
            body: { error: 'attestation_invalid' },
          })),
        })
      )
    ).resolves.toMatchObject({ status: 400, body: { error: 'attestation_invalid' } });
    await expect(
      challengeSsoSession(
        SESSION_ID,
        body,
        dependencies({ fetchProjection: vi.fn().mockResolvedValue(null) })
      )
    ).resolves.toMatchObject({
      status: 403,
      body: { error: 'sso_requires_phone', leg: 'challenge' },
    });
  });

  it('records the return code atomically and reports storage races', async () => {
    const recordChallenge = vi.fn().mockResolvedValue(true);
    await expect(
      challengeSsoSession(SESSION_ID, body, dependencies({ recordChallenge }))
    ).resolves.toMatchObject({
      ok: true,
      returnCode: 'return-code',
      hasMerchantCallback: false,
    });
    expect(recordChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, returnCodeExpiresAt: NOW + 90 })
    );
    await expect(
      challengeSsoSession(
        SESSION_ID,
        body,
        dependencies({ recordChallenge: vi.fn().mockResolvedValue(false) })
      )
    ).resolves.toMatchObject({ status: 409 });
  });
});
