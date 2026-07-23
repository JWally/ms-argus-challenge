import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../shared/http.js';
import { createSsoValidationService, type SsoValidationDependencies } from './sso-validation.js';
import type { SsoBrowserState } from './sso-state.js';

const state: SsoBrowserState = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  nonce: 'sso-proof-nonce',
  cpi: 'argus_cpi_test_Example12345.stepup',
  proofRequired: true,
  freshProofRequired: false,
  challengeUrl: '/sso/challenge/session',
  failureReturnUrl: '/merchant?status=failed',
};

const approved = {
  verdict: 'approved' as const,
  reason: 'approved',
  reasons: [],
  merchantSessionId: 'merchant-session',
  cpi: state.cpi,
};

function setup(overrides: Partial<SsoValidationDependencies> = {}) {
  const dependencies: SsoValidationDependencies = {
    validate: vi.fn().mockResolvedValue(approved),
    loadTrust: vi.fn().mockReturnValue(null),
    clearTrust: vi.fn(),
    hasPasskeyHint: vi.fn().mockReturnValue(true),
    clearPasskeyHint: vi.fn(),
    authenticatePasskey: vi.fn().mockResolvedValue({ id: 'existing-passkey' }),
    createPasskey: vi.fn().mockResolvedValue({ id: 'new-passkey' }),
    rememberPasskey: vi.fn(),
    googleProof: vi.fn().mockResolvedValue({ provider: 'google', token: 'google-token' }),
    ...overrides,
  };
  return { dependencies, service: createSsoValidationService(dependencies) };
}

describe('SSO browser assurance transitions', () => {
  it('validates fastpass without prompting for proof', async () => {
    const { dependencies, service } = setup();

    await expect(
      service.validateInitial(
        {
          ...state,
          cpi: 'argus_cpi_test_Example12345.fastpass',
          proofRequired: false,
        },
        'return-code'
      )
    ).resolves.toMatchObject({ kind: 'validated', result: approved });
    expect(dependencies.validate).toHaveBeenCalledWith(
      expect.objectContaining({ cpi: 'argus_cpi_test_Example12345.fastpass' }),
      'return-code',
      {}
    );
  });

  it('always presents fresh proof for forceauth', async () => {
    const { dependencies, service } = setup();

    await expect(
      service.validateInitial(
        { ...state, cpi: 'argus_cpi_test_Example12345.forceauth', freshProofRequired: true },
        'return-code'
      )
    ).resolves.toEqual({ kind: 'proof-required', passkeySeen: true });
    expect(dependencies.loadTrust).not.toHaveBeenCalled();
    expect(dependencies.validate).not.toHaveBeenCalled();
  });

  it('clears rejected stepup trust and offers explicit proof', async () => {
    const { dependencies, service } = setup({
      loadTrust: vi.fn().mockReturnValue('stale-trust'),
      validate: vi.fn().mockRejectedValue(new HttpError(401, 'device_trust_rejected', {})),
    });

    await expect(service.validateInitial(state, 'return-code')).resolves.toEqual({
      kind: 'proof-required',
      passkeySeen: true,
    });
    expect(dependencies.clearTrust).toHaveBeenCalledOnce();
  });

  it('submits Google as a peer proof choice', async () => {
    const { dependencies, service } = setup();

    await expect(service.validateProof(state, 'return-code', 'google')).resolves.toMatchObject({
      kind: 'validated',
      result: approved,
    });
    expect(dependencies.validate).toHaveBeenCalledWith(state, 'return-code', {
      oauth: { provider: 'google', token: 'google-token' },
    });
  });

  it('remembers a newly created passkey only after server approval', async () => {
    const credential = { id: 'new-passkey' };
    const { dependencies, service } = setup({
      createPasskey: vi.fn().mockResolvedValue(credential),
    });

    await expect(
      service.validateProof(state, 'return-code', 'passkey-create')
    ).resolves.toMatchObject({ kind: 'validated', result: approved });
    expect(dependencies.rememberPasskey).toHaveBeenCalledWith(credential);
  });

  it('forgets a rejected passkey hint before offering another proof', async () => {
    const { dependencies, service } = setup({
      authenticatePasskey: vi.fn().mockRejectedValue(new Error('credential_not_found')),
    });

    await expect(
      service.validateProof(state, 'return-code', 'passkey-auth')
    ).resolves.toMatchObject({ kind: 'proof-error' });
    expect(dependencies.clearPasskeyHint).toHaveBeenCalledOnce();
  });
});
