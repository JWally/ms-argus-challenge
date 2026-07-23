import { describe, expect, it, vi } from 'vitest';
import type {
  AttestationVerification,
  AttestationVerifier,
  DecodedAttestationEnvelope,
} from './attestation-bindings.js';
import { preparePhoneAttestation } from './phone-attestation-request.js';

const SESSION_ID = '4f4cf495-a98b-4b76-9099-8ad59dc85ccb';
const PHONE_KEY = 'phone-public-key';
const desktopAttestation = {
  envelope: 'desktop-attestation-envelope',
  signature: 'signature',
  publicKey: 'desktop-public-key',
  keyId: 'desktop-key-id',
  argusSessionId: 'argus-desktop-1',
  receivedAt: 1_899_999_990,
  envelopeDecoded: {} as DecodedAttestationEnvelope,
};
const session = {
  id: SESSION_ID,
  nonce: 'nonce-123456789',
  expiresAt: 1_900_000_300,
  challengeId: 'checkout_action_123456789',
  cpi: 'argus_cpi_test_Example12345.forceauth',
  proofRequired: true,
  freshProofRequired: false,
  hostPreflightRequired: false,
  verdict: 'pending' as const,
  desktopAttestation,
};

const body = {
  argusSessionId: 'argus-phone-1',
  attestation: {
    envelope: 'phone-attestation-envelope',
    signature: 'signature',
    publicKey: PHONE_KEY,
    keyId: 'phone-key-id',
  },
  desktopEnvelope: 'sealed-desktop-envelope',
  desktopArgusSessionId: desktopAttestation.argusSessionId,
  desktopKeyId: desktopAttestation.keyId,
  webauthn: { id: 'credential' },
};

function verifier(): AttestationVerifier {
  return {
    verify: vi.fn((): AttestationVerification => ({
      ok: true,
      decoded: {
        v: 1,
        purpose: 'argus-pair-v1',
        payload: { role: 'phone', sessionId: SESSION_ID, nonce: session.nonce },
        scanSessionId: body.argusSessionId,
        iat: 1_899_999_999,
        exp: 1_900_000_060,
        keyId: 'phone-key-id',
      },
    })),
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadSession: vi.fn().mockResolvedValue(session),
    verifier: verifier(),
    openDesktopEnvelope: vi.fn().mockResolvedValue({
      v: 1,
      connectionId: 'desktop-connection',
      sessionId: SESSION_ID,
      role: 'desktop',
      ip: '203.0.113.8',
      origin: 'https://challenge.example',
      iat: 1_899_999_990,
    }),
    claimPhoneArgusSession: vi.fn().mockResolvedValue({ ok: true }),
    nowEpochSeconds: () => 1_900_000_000,
    ...overrides,
  };
}

describe('phone attestation request preparation', () => {
  it('binds signed phone evidence to stored desktop and authenticated WS identity', async () => {
    const deps = dependencies();
    await expect(preparePhoneAttestation(body, SESSION_ID, deps)).resolves.toMatchObject({
      ok: true,
      argusSessionId: 'argus-phone-1',
      stored: { publicKey: PHONE_KEY, receivedAt: 1_900_000_000 },
      desktopEnvelope: { connectionId: 'desktop-connection', role: 'desktop' },
      webauthnInput: { id: 'credential' },
    });
    expect(deps.claimPhoneArgusSession).toHaveBeenCalledWith('argus-phone-1', SESSION_ID);
  });

  it.each([
    ['missing session', { loadSession: vi.fn().mockResolvedValue(null) }, 404, 'session_not_found'],
    [
      'desktop pending',
      { loadSession: vi.fn().mockResolvedValue({ ...session, desktopAttestation: undefined }) },
      409,
      'desktop_not_attested_yet',
    ],
    [
      'fresh proof with trust token',
      { loadSession: vi.fn().mockResolvedValue({ ...session, freshProofRequired: true }) },
      401,
      'fresh_proof_required',
    ],
  ])('rejects %s', async (_label, overrides, status, error) => {
    await expect(
      preparePhoneAttestation(
        _label === 'fresh proof with trust token' ? { ...body, deviceTrustToken: 'trust' } : body,
        SESSION_ID,
        dependencies(overrides)
      )
    ).resolves.toMatchObject({ ok: false, status, body: { error } });
  });

  it.each([
    [{ desktopEnvelope: 'forged' }, 'desktop_binding_unauthenticated'],
    [{ desktopArgusSessionId: 'substituted' }, 'desktop_argus_session_mismatch'],
    [{ desktopKeyId: 'substituted' }, 'desktop_keyId_mismatch'],
    [
      {
        attestation: {
          ...body.attestation,
          keyId: desktopAttestation.keyId,
          publicKey: desktopAttestation.publicKey,
        },
      },
      'same_device_both_sides',
    ],
  ])('rejects desktop binding substitution %#', async (override, error) => {
    const deps = dependencies(
      'desktopEnvelope' in override && override.desktopEnvelope === 'forged'
        ? { openDesktopEnvelope: vi.fn().mockResolvedValue(null) }
        : {}
    );
    await expect(
      preparePhoneAttestation({ ...body, ...override }, SESSION_ID, deps)
    ).resolves.toMatchObject({ ok: false, status: 400, body: { error } });
  });

  it('distinguishes same-device retry from a different phone', async () => {
    await expect(
      preparePhoneAttestation(
        body,
        SESSION_ID,
        dependencies({
          loadSession: vi.fn().mockResolvedValue({
            ...session,
            phoneAttestation: { publicKey: PHONE_KEY },
          }),
        })
      )
    ).resolves.toMatchObject({ ok: false, body: { error: 'already_attested' } });
    await expect(
      preparePhoneAttestation(
        body,
        SESSION_ID,
        dependencies({
          loadSession: vi.fn().mockResolvedValue({
            ...session,
            phoneAttestation: { publicKey: 'different-phone' },
          }),
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      body: { error: 'session_paired_with_other_device' },
    });
  });
});
