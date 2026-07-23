import { merchantProjection } from '@argus-challenge/testkit';
import { describe, expect, it, vi } from 'vitest';
import { collectDesktopEvidence } from './desktop-evidence.js';

const NOW = 1_900_000_000_000;
const iframe = merchantProjection({
  session_id: 'iframe-scan',
  created_at: NOW,
  ip: '203.0.113.8',
});
const host = merchantProjection({
  session_id: 'host-scan',
  created_at: NOW,
  ip: '203.0.113.8',
});

describe('desktop evidence collection', () => {
  it('fetches bound host and iframe projections concurrently and annotates agreement', async () => {
    const fetchProjection = vi.fn(async (id: string) => (id === 'host-scan' ? host : iframe));
    await expect(
      collectDesktopEvidence(
        {
          hostArgusSessionId: 'host-scan',
          iframeArgusSessionId: 'iframe-scan',
          pairSessionId: 'pair-session',
        },
        { fetchProjection, nowMilliseconds: () => NOW }
      )
    ).resolves.toMatchObject({
      desktopProjection: { session_id: 'iframe-scan' },
      desktopScan: { individualScore: 0 },
      annotations: {
        host_preflight_bound: true,
        host_projection_present: true,
        host_iframe_ip_match: true,
      },
    });
    expect(fetchProjection).toHaveBeenCalledTimes(2);
  });

  it('does not let clean host evidence replace a missing iframe projection', async () => {
    const fetchProjection = vi.fn(async (id: string) => (id === 'host-scan' ? host : null));
    await expect(
      collectDesktopEvidence(
        {
          hostArgusSessionId: 'host-scan',
          iframeArgusSessionId: 'missing',
          pairSessionId: 'pair-session',
        },
        { fetchProjection, nowMilliseconds: () => NOW }
      )
    ).resolves.toMatchObject({
      desktopProjection: null,
      desktopScan: null,
      annotations: { host_projection_present: true },
    });
  });
});
