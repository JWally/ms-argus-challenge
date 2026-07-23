import { openFixedVerdictEnvelope } from '@argus-challenge/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createVerdictDisclosure } from './verdict-disclosure.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const key = new Uint8Array(32).fill(9);
const desktopEnvelope = {
  v: 1 as const,
  connectionId: 'desktop-connection',
  sessionId: SESSION_ID,
  role: 'desktop' as const,
  ip: '203.0.113.8',
  origin: 'https://challenge.example',
  iat: 1_900_000_000,
};

function dependencies(state = { challenge: true, phoneDone: false }) {
  return {
    revealKey: vi.fn().mockResolvedValue(key),
    loadRevealState: vi.fn().mockResolvedValue(state),
    publishDesktop: vi.fn().mockResolvedValue(undefined),
  };
}

describe('verdict disclosure', () => {
  it('pushes ciphertext but withholds the key while the drawing challenge is active', async () => {
    const deps = dependencies();
    const disclosure = createVerdictDisclosure(deps);
    const body = await disclosure.deliver({
      desktopEnvelope,
      sessionId: SESSION_ID,
      verdict: 'failed',
      reason: 'phone_on_proxy',
      annotations: { phone_is_proxy: true },
      nextDeviceTrust: null,
      decidedAt: 1_900_000_000,
      now: 1_900_000_010,
    });
    expect(body).toMatchObject({ verdict: 'complete', reason: null, annotations: {} });
    expect(body).not.toHaveProperty('revealKey');
    expect(deps.publishDesktop).toHaveBeenCalledTimes(1);
    expect(deps.publishDesktop).toHaveBeenCalledWith(
      'desktop-connection',
      expect.objectContaining({ data: expect.objectContaining({ kind: 'verdict-sealed' }) })
    );
  });

  it('releases the same key after phone completion and decrypts the real decision', async () => {
    const deps = dependencies({ challenge: true, phoneDone: true });
    const disclosure = createVerdictDisclosure(deps);
    const result = await disclosure.buildResult({
      sessionId: SESSION_ID,
      verdict: 'paired',
      reason: 'paired_desktop_and_phone',
      annotations: { total_score: 0 },
      nextDeviceTrust: null,
      decidedAt: 1_900_000_000,
      now: 1_900_000_010,
    });
    expect(result).toMatchObject({ status: 'sealed', revealKey: expect.any(String) });
    const opened = await openFixedVerdictEnvelope(key, SESSION_ID, result.envelope);
    expect(opened).toEqual({
      kind: 'desktop-verdict',
      verdict: 'paired',
      reason: 'paired_desktop_and_phone',
      annotations: { total_score: 0 },
    });
  });

  it('truncates oversized annotations without changing authorization', async () => {
    const disclosure = createVerdictDisclosure(
      dependencies({ challenge: false, phoneDone: false })
    );
    const result = await disclosure.buildResult({
      sessionId: SESSION_ID,
      verdict: 'failed',
      reason: 'projection_lookup_failed',
      annotations: { huge: 'x'.repeat(20_000) },
      nextDeviceTrust: null,
      decidedAt: 1_900_000_000,
      now: 1_900_000_010,
    });
    await expect(openFixedVerdictEnvelope(key, SESSION_ID, result.envelope)).resolves.toMatchObject(
      {
        verdict: 'failed',
        annotations: { verdict_annotations_truncated: true },
      }
    );
  });
});
