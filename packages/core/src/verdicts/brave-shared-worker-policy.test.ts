import { merchantProjection } from '@argus-challenge/testkit';
import { describe, expect, it } from 'vitest';
import { classifyProjection } from './projection-policy.js';
import { applyBraveSharedWorkerPolicy } from './brave-shared-worker-policy.js';

const NOW = 1_900_000_000_000;
const projection = merchantProjection({
  created_at: NOW,
  automation: 0,
  device_tampering: 50,
  network_tampering: 0,
  worker_scope_evidence: {
    all_scopes_consistent: false,
    main_web_consensus_id: 'consensus-1',
    shared_partition_candidate: true,
    brave_detected: true,
    device_tampering_without_worker: 5,
  },
});

describe('Brave shared-worker policy', () => {
  it('removes only the positively identified worker partition artifact', () => {
    expect(
      applyBraveSharedWorkerPolicy(
        { iframeProjection: projection, iframeScan: classifyProjection(projection) },
        NOW
      )
    ).toMatchObject({
      effectiveIframeScan: { individualScore: 5 },
      annotations: {
        brave_shared_worker_adjusted: true,
        iframe_raw_score: 50,
        iframe_effective_score: 5,
      },
    });
  });

  it.each([
    { worker_scope_evidence: { ...projection.worker_scope_evidence!, brave_detected: false } },
    { worker_scope_evidence: null },
    { automation: 40 },
    { created_at: NOW - 181_000 },
  ])('does not relax incomplete or unsafe evidence %#', (override) => {
    const candidate = merchantProjection({ ...projection, ...override });
    expect(
      applyBraveSharedWorkerPolicy(
        { iframeProjection: candidate, iframeScan: classifyProjection(candidate) },
        NOW
      )
    ).toMatchObject({
      effectiveIframeScan: { individualScore: expect.any(Number) },
      annotations: { brave_shared_worker_adjusted: false },
    });
  });
});
