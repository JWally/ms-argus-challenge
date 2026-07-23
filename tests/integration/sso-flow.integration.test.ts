import type { AttestationInput, SsoSession } from '@argus-challenge/core';
import { challengeSsoSession, startSsoSession, validateSsoSession } from '@argus-challenge/core';
import { merchantProjection } from '@argus-challenge/testkit';
import { describe, expect, it, vi } from 'vitest';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const NOW = 1_900_000_000;
const attestation: AttestationInput = {
  envelope: 'envelope',
  signature: 'signature',
  publicKey: 'public-key',
  keyId: 'device-key',
};
const phoneProjection = merchantProjection({
  created_at: NOW * 1000,
  identification: {
    browserDetails: {
      browserName: 'Mobile Safari',
      browserVersion: '26',
      device: 'mobile',
      os: 'iOS',
      userAgent: 'Mozilla/5.0 (iPhone) Mobile',
    },
  },
});

function harness() {
  let session: SsoSession | null = null;
  return {
    get session() {
      return session;
    },
    create: vi.fn(async (next: SsoSession) => {
      session = next;
      return true;
    }),
    load: vi.fn(async () => session),
    recordChallenge: vi.fn(async (input) => {
      if (!session || session.challengeProfile) return false;
      session = { ...session, ...input };
      return true;
    }),
    recordValidation: vi.fn(async (input) => {
      if (!session || session.returnCodeConsumedAt) return false;
      session = {
        ...session,
        ...input,
        ...(input.approval ?? {}),
      };
      return true;
    }),
  };
}

describe('SSO application flow', () => {
  it('binds all three phone scans and produces a single-use merchant approval', async () => {
    const repository = harness();
    const started = await startSsoSession(
      {
        cpi: 'argus_cpi_test_Example12345.forceauth',
        argusSessionId: 'start-scan',
        attestation,
        merchantSessionId: 'merchant-session',
        merchantCallbackUrl: 'https://games.example/sso/callback',
        merchantChallengeId: 'checkout_action_123456789',
      },
      {
        callbackOrigins: ['https://games.example'],
        validateAttestation: vi.fn(() => ({ ok: true as const, attestation })),
        fetchProjection: vi.fn().mockResolvedValue(phoneProjection),
        createSession: repository.create,
        newSessionId: () => SESSION_ID,
        newNonce: () => 'sso-nonce-123456789',
        newMerchantSessionId: () => 'generated-merchant-session',
        nowEpochSeconds: () => NOW,
        sessionTtlSeconds: 300,
        proofRequiredByDefault: false,
      }
    );
    expect(started).toMatchObject({
      ok: true,
      sessionId: SESSION_ID,
      session: { proofRequired: true, freshProofRequired: true },
    });

    const challenged = await challengeSsoSession(
      SESSION_ID,
      { argusSessionId: 'challenge-scan', attestation },
      {
        loadSession: repository.load,
        validateAttestation: vi.fn(() => ({ ok: true as const, attestation })),
        fetchProjection: vi.fn().mockResolvedValue(phoneProjection),
        mintReturnCode: () => ({ value: 'sso-return-code', expiresAt: NOW + 90 }),
        recordChallenge: repository.recordChallenge,
        nowEpochSeconds: () => NOW,
      }
    );
    expect(challenged).toMatchObject({ ok: true, returnCode: 'sso-return-code' });
    expect(repository.session?.returnCodeHash).not.toContain('sso-return-code');

    const validated = await validateSsoSession(
      SESSION_ID,
      {
        returnCode: 'sso-return-code',
        argusSessionId: 'validate-scan',
        attestation,
        webauthn: { id: 'credential' },
      },
      '203.0.113.8',
      {
        loadSession: repository.load,
        validateAttestation: vi.fn(() => ({ ok: true as const, attestation })),
        fetchProjection: vi.fn().mockResolvedValue(phoneProjection),
        verifyProof: vi.fn().mockResolvedValue({
          ok: true,
          annotations: { phone_webauthn_attested: true },
          trustRedeemed: false,
        }),
        mintApprovalToken: () => 'approval-token',
        mintDeviceTrust: vi.fn().mockResolvedValue('next-device-trust'),
        recordValidation: repository.recordValidation,
        nowEpochSeconds: () => NOW,
        approvalTtlSeconds: 600,
      }
    );
    expect(validated).toMatchObject({
      ok: true,
      verdict: { ok: true, reason: 'approved' },
      approvalToken: 'approval-token',
      merchantChallengeId: 'checkout_action_123456789',
      nextDeviceTrust: 'next-device-trust',
    });
    expect(repository.session).toMatchObject({
      verdict: 'approved',
      returnCodeConsumedAt: NOW,
      approvalTokenHash: expect.not.stringContaining('approval-token'),
    });

    await expect(
      validateSsoSession(SESSION_ID, { returnCode: 'sso-return-code' }, '203.0.113.8', {
        loadSession: repository.load,
        validateAttestation: vi.fn(),
        fetchProjection: vi.fn(),
        verifyProof: vi.fn(),
        mintApprovalToken: vi.fn(),
        mintDeviceTrust: vi.fn(),
        recordValidation: repository.recordValidation,
        nowEpochSeconds: () => NOW,
        approvalTtlSeconds: 600,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      body: { error: 'sso_return_code_consumed' },
    });
  });

  it('rejects a non-phone start without creating state', async () => {
    const repository = harness();
    const desktop = merchantProjection({ created_at: NOW * 1000 });
    await expect(
      startSsoSession(
        {
          cpi: 'argus_cpi_test_Example12345',
          argusSessionId: 'desktop-scan',
          attestation,
        },
        {
          callbackOrigins: [],
          validateAttestation: vi.fn(() => ({ ok: true as const, attestation })),
          fetchProjection: vi.fn().mockResolvedValue(desktop),
          createSession: repository.create,
          newSessionId: () => SESSION_ID,
          newNonce: () => 'sso-nonce-123456789',
          newMerchantSessionId: () => 'merchant-session',
          nowEpochSeconds: () => NOW,
          sessionTtlSeconds: 300,
          proofRequiredByDefault: false,
        }
      )
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      body: { error: 'sso_requires_phone', leg: 'start' },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
