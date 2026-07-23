import { describe, expect, it } from 'vitest';
import { merchantProjection } from '@argus-challenge/testkit';
import { classifyProjection } from './projection-policy.js';
import { decidePhoneVerdict } from './phone-verdict-decision.js';

const NOW = Date.UTC(2030, 0, 1);
const DESKTOP_PUBLIC_KEY = 'desktop-public-key';
const PHONE_PUBLIC_KEY = 'phone-public-key';

function phoneProjection() {
  return merchantProjection({
    session_id: 'phone-session',
    created_at: NOW,
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
}

function input(overrides: Record<string, unknown> = {}) {
  const desktopProjection = merchantProjection({
    session_id: 'desktop-session',
    created_at: NOW,
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
  const phone = phoneProjection();
  return {
    proofRequired: true,
    proofAnnotations: { phone_webauthn_attested: true, phone_webauthn_format: 'none' },
    desktopProjection,
    phoneProjection: phone,
    desktopScan: classifyProjection(desktopProjection),
    phoneScan: classifyProjection(phone),
    desktopPublicKey: DESKTOP_PUBLIC_KEY,
    phonePublicKey: PHONE_PUBLIC_KEY,
    hostAnnotations: { host_preflight_bound: true },
    ...overrides,
  };
}

describe('phone verdict decision', () => {
  it('fails required proof before consulting projections', () => {
    expect(
      decidePhoneVerdict(
        input({
          proofAnnotations: { phone_webauthn_attested: false, phone_webauthn_error: 'missing' },
          desktopProjection: null,
          phoneProjection: null,
          desktopScan: null,
          phoneScan: null,
        }),
        NOW
      )
    ).toEqual({
      verdict: 'failed',
      reason: 'no_proof_of_life',
      proofOfLife: false,
      annotations: {
        desktop_projection_present: false,
        phone_projection_present: false,
        phone_webauthn_attested: false,
        phone_webauthn_error: 'missing',
        host_preflight_bound: true,
      },
    });
  });

  it('fails closed on unavailable or stale projections', () => {
    expect(decidePhoneVerdict(input({ phoneScan: null }), NOW).reason).toBe(
      'projection_lookup_failed'
    );
    const staleDesktop = merchantProjection({
      ...input().desktopProjection,
      created_at: NOW - 300_000,
    });
    expect(
      decidePhoneVerdict(
        input({
          desktopProjection: staleDesktop,
          desktopScan: classifyProjection(staleDesktop),
        }),
        NOW
      )
    ).toMatchObject({
      verdict: 'failed',
      reason: 'projection_stale',
      annotations: { desktop_projection_age_sec: 300, freshness_window_sec: 180 },
    });
  });

  it('fails when a projection identity does not match the attestation key', () => {
    expect(
      decidePhoneVerdict(input({ phonePublicKey: 'different-public-key' }), NOW)
    ).toMatchObject({
      verdict: 'failed',
      reason: 'phone_projection_device_mismatch',
      annotations: {
        desktop_projection_device_bound: true,
        phone_projection_device_bound: false,
      },
    });
  });

  it('allows proof-optional clean projections while retaining negative proof evidence', () => {
    expect(
      decidePhoneVerdict(
        input({
          proofRequired: false,
          proofAnnotations: { phone_webauthn_attested: false, phone_webauthn_error: 'missing' },
        }),
        NOW
      )
    ).toMatchObject({
      verdict: 'paired',
      reason: 'paired_desktop_and_phone',
      proofOfLife: false,
      annotations: { proof_of_life: false, phone_webauthn_error: 'missing' },
    });
  });

  it('preserves projection failures and host evidence', () => {
    const desktop = merchantProjection({
      ...input().desktopProjection,
      created_at: NOW,
      tags: ['proxy'],
    });
    expect(
      decidePhoneVerdict(
        input({ desktopProjection: desktop, desktopScan: classifyProjection(desktop) }),
        NOW
      )
    ).toMatchObject({
      verdict: 'failed',
      reason: 'desktop_on_proxy',
      annotations: { desktop_is_proxy: true, host_preflight_bound: true },
    });
  });
});
