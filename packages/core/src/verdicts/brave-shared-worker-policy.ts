import type { MerchantProjection } from '@argus-challenge/contracts';
import {
  INDIVIDUAL_SCORE_LIMIT,
  isProjectionFresh,
  type ClassifiedProjection,
} from './projection-policy.js';

interface BraveWorkerPolicyInput {
  iframeProjection: MerchantProjection | null;
  iframeScan: ClassifiedProjection | null;
}

export interface BraveWorkerPolicyResult {
  effectiveIframeScan: ClassifiedProjection | null;
  annotations: Record<string, unknown>;
}

function hasSafeScores(projection: MerchantProjection): boolean {
  const evidence = projection.worker_scope_evidence;
  return Boolean(
    evidence &&
    projection.device_tampering >= INDIVIDUAL_SCORE_LIMIT &&
    projection.automation < INDIVIDUAL_SCORE_LIMIT &&
    projection.network_tampering < INDIVIDUAL_SCORE_LIMIT &&
    evidence.device_tampering_without_worker < INDIVIDUAL_SCORE_LIMIT
  );
}

function qualifies(input: BraveWorkerPolicyInput, nowMilliseconds: number): boolean {
  const evidence = input.iframeProjection?.worker_scope_evidence;
  return Boolean(
    input.iframeProjection &&
    input.iframeScan &&
    evidence?.brave_detected &&
    evidence.shared_partition_candidate &&
    evidence.main_web_consensus_id &&
    isProjectionFresh(input.iframeProjection, nowMilliseconds) &&
    hasSafeScores(input.iframeProjection)
  );
}

export function applyBraveSharedWorkerPolicy(
  input: BraveWorkerPolicyInput,
  nowMilliseconds: number = Date.now()
): BraveWorkerPolicyResult {
  if (!qualifies(input, nowMilliseconds) || !input.iframeProjection || !input.iframeScan) {
    return {
      effectiveIframeScan: input.iframeScan,
      annotations: { brave_shared_worker_adjusted: false },
    };
  }
  const evidence = input.iframeProjection.worker_scope_evidence!;
  const effectiveScore = Math.max(
    input.iframeProjection.automation,
    evidence.device_tampering_without_worker,
    input.iframeProjection.network_tampering
  );
  return {
    effectiveIframeScan: { ...input.iframeScan, individualScore: effectiveScore },
    annotations: {
      brave_shared_worker_adjusted: true,
      brave_shared_worker_basis: 'inner_main_web_consensus',
      iframe_raw_score: input.iframeScan.individualScore,
      iframe_effective_score: effectiveScore,
    },
  };
}
