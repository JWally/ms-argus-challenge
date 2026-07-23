import { describe, expect, it, vi } from 'vitest';
import { merchantProjection } from '@argus-challenge/testkit';
import { classifyProjection } from '../verdicts/projection-policy.js';
import {
  createPhoneAttestationHandler,
  type PhoneAttestationRouteDependencies,
} from './phone-attestation-route.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const REQUESTER_IP = '203.0.113.20';
const NOW = 1_900_000_000;
const desktopProjection = merchantProjection({
  session_id: 'argus-desktop-1',
  created_at: NOW * 1000,
  identification: {
    crypto_device_id: '02a05e53a4',
    crypto_verified: true,
    browserDetails: {
      browserName: 'Chrome',
      browserVersion: '150',
      device: 'desktop',
      os: 'Windows',
      userAgent: 'Mozilla/5.0',
    },
  },
});
const phoneProjection = merchantProjection({
  session_id: 'argus-phone-1',
  created_at: NOW * 1000,
  identification: {
    crypto_device_id: 'ce382673da',
    crypto_verified: true,
    browserDetails: {
      browserName: 'Chrome',
      browserVersion: '150',
      device: 'mobile',
      os: 'iOS',
      userAgent: 'Mozilla/5.0 (iPhone) Mobile',
    },
  },
});

function prepared(overrides: Record<string, unknown> = {}) {
  const desktopAttestation = {
    argusSessionId: 'argus-desktop-1',
    envelope: 'desktop-envelope',
    signature: 'desktop-signature',
    publicKey: 'desktop-public-key',
    keyId: 'desktop-key-id',
    receivedAt: NOW - 1,
    envelopeDecoded: {
      v: 1,
      purpose: 'argus-pair-v1',
      payload: {},
      iat: 1,
      exp: 2,
      keyId: 'desktop-key-id',
    },
  };
  return {
    ok: true as const,
    session: {
      id: SESSION_ID,
      nonce: 'pair-nonce',
      expiresAt: NOW + 300,
      challengeId: 'checkout_action_123456789',
      cpi: 'argus_cpi_test_Example12345.stepup',
      proofRequired: true,
      freshProofRequired: false,
      hostPreflightRequired: false,
      verdict: 'pending' as const,
      desktopAttestation,
    },
    argusSessionId: 'argus-phone-1',
    attestation: {
      envelope: 'phone-envelope',
      signature: 'phone-signature',
      publicKey: 'phone-public-key',
      keyId: 'phone-key-id',
    },
    stored: {
      argusSessionId: 'argus-phone-1',
      envelope: 'phone-envelope',
      signature: 'phone-signature',
      publicKey: 'phone-public-key',
      keyId: 'phone-key-id',
      receivedAt: NOW,
      envelopeDecoded: {
        v: 1,
        purpose: 'argus-pair-v1',
        payload: {},
        iat: 1,
        exp: 2,
        keyId: 'phone-key-id',
      },
    },
    desktopEnvelope: {
      v: 1 as const,
      connectionId: 'desktop-connection',
      sessionId: SESSION_ID,
      role: 'desktop' as const,
      ip: '203.0.113.10',
      origin: 'https://challenge.example',
      iat: NOW - 1,
    },
    webauthnInput: { id: 'credential-1' },
    oauthInput: undefined,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<PhoneAttestationRouteDependencies> = {}
): PhoneAttestationRouteDependencies {
  return {
    prepare: vi.fn().mockResolvedValue(prepared()),
    verifyDeviceTrust: vi.fn(),
    verifyProof: vi.fn().mockResolvedValue({
      phone_webauthn_attested: true,
      phone_webauthn_format: 'none',
    }),
    collectDesktopEvidence: vi.fn().mockResolvedValue({
      desktopProjection,
      desktopScan: classifyProjection(desktopProjection),
      annotations: { host_preflight_bound: false },
    }),
    fetchPhoneProjection: vi.fn().mockResolvedValue(phoneProjection),
    mintDeviceTrust: vi.fn().mockResolvedValue('next-device-trust'),
    commit: vi.fn().mockResolvedValue({ outcome: 'committed' }),
    deliverVerdict: vi.fn().mockResolvedValue({
      verdict: 'complete',
      reason: null,
      annotations: {},
      phoneState: 'sealed-phone-state',
    }),
    nowEpochSeconds: () => NOW,
    proofRequiredByDefault: false,
    ...overrides,
  };
}

describe('phone attestation route', () => {
  it('runs proof and projections, commits, then discloses a sealed result', async () => {
    const deps = dependencies();
    await expect(
      createPhoneAttestationHandler(deps)({}, SESSION_ID, REQUESTER_IP)
    ).resolves.toMatchObject({ status: 200, body: { phoneState: 'sealed-phone-state' } });
    expect(deps.verifyProof).toHaveBeenCalledWith({
      webauthn: { id: 'credential-1' },
      oauth: undefined,
      expectedNonce: 'pair-nonce',
      argusPublicKey: 'phone-public-key',
      trustRedeemed: false,
    });
    expect(deps.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        verdict: 'paired',
        reason: 'paired_desktop_and_phone',
        annotations: expect.objectContaining({
          desktop_projection_device_bound: true,
          phone_projection_device_bound: true,
        }),
      })
    );
    expect(deps.deliverVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ nextDeviceTrust: 'next-device-trust', now: NOW })
    );
  });

  it('rejects invalid device trust before projection work', async () => {
    const deps = dependencies({
      prepare: vi.fn().mockResolvedValue(prepared({ deviceTrustToken: 'expired-token' })),
      verifyDeviceTrust: vi.fn().mockResolvedValue({ ok: false, reason: 'expired' }),
    });
    await expect(
      createPhoneAttestationHandler(deps)({}, SESSION_ID, REQUESTER_IP)
    ).resolves.toEqual({
      status: 401,
      body: { error: 'device_trust_invalid', reason: 'expired' },
    });
    expect(deps.fetchPhoneProjection).not.toHaveBeenCalled();
  });

  it('records trust redemption and IP drift without minting replacement trust', async () => {
    const deps = dependencies({
      prepare: vi.fn().mockResolvedValue(prepared({ deviceTrustToken: 'valid-token' })),
      verifyDeviceTrust: vi.fn().mockResolvedValue({ ok: true, ipChanged: true }),
    });
    await createPhoneAttestationHandler(deps)({}, SESSION_ID, REQUESTER_IP);
    expect(deps.mintDeviceTrust).not.toHaveBeenCalled();
    expect(deps.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: expect.objectContaining({
          phone_device_trust_redeemed: true,
          phone_device_trust_ip_changed: true,
        }),
      })
    );
  });

  it('does not mint trust when integrity fails', async () => {
    const proxy = merchantProjection({ ...phoneProjection, tags: ['proxy'] });
    const deps = dependencies({ fetchPhoneProjection: vi.fn().mockResolvedValue(proxy) });
    await createPhoneAttestationHandler(deps)({}, SESSION_ID, REQUESTER_IP);
    expect(deps.mintDeviceTrust).not.toHaveBeenCalled();
    expect(deps.commit).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'failed', reason: 'phone_on_proxy' })
    );
  });

  it('fails when the phone projection belongs to a different attestation key', async () => {
    const mismatched = merchantProjection({
      ...phoneProjection,
      identification: {
        ...phoneProjection.identification,
        crypto_device_id: '8193b45484',
      },
    });
    const deps = dependencies({ fetchPhoneProjection: vi.fn().mockResolvedValue(mismatched) });

    await createPhoneAttestationHandler(deps)({}, SESSION_ID, REQUESTER_IP);

    expect(deps.mintDeviceTrust).not.toHaveBeenCalled();
    expect(deps.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: 'failed',
        reason: 'phone_projection_device_mismatch',
      })
    );
  });

  it.each([
    [
      'same_device_retry',
      200,
      { verdict: 'complete', reason: null, annotations: {}, concurrent_loser: true },
    ],
    [
      'other_device',
      409,
      {
        error: 'session_paired_with_other_device',
        reason: 'This QR code is already paired with a different device.',
      },
    ],
    ['write_conflict', 409, { error: 'write_conflict' }],
  ] as const)('maps commit outcome %s without disclosure', async (outcome, status, body) => {
    const deps = dependencies({ commit: vi.fn().mockResolvedValue({ outcome }) });
    await expect(
      createPhoneAttestationHandler(deps)({}, SESSION_ID, REQUESTER_IP)
    ).resolves.toEqual({ status, body });
    expect(deps.deliverVerdict).not.toHaveBeenCalled();
  });
});
