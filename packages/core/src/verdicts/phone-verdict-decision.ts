import type { MerchantProjection } from '@argus-challenge/contracts';
import {
  computeProjectionVerdict,
  isProjectionFresh,
  projectionAgeSeconds,
  PROJECTION_FRESHNESS_WINDOW_SECONDS,
  type ClassifiedProjection,
} from './projection-policy.js';

export interface ProofAnnotations extends Record<string, unknown> {
  phone_webauthn_attested: boolean;
}

export interface PhoneVerdictDecisionInput {
  proofRequired: boolean;
  proofAnnotations: ProofAnnotations;
  desktopProjection: MerchantProjection | null;
  phoneProjection: MerchantProjection | null;
  desktopScan: ClassifiedProjection | null;
  phoneScan: ClassifiedProjection | null;
  hostAnnotations: Record<string, unknown>;
}

export interface PhoneVerdictDecision {
  verdict: 'paired' | 'failed';
  reason: string;
  annotations: Record<string, unknown>;
  proofOfLife: boolean;
}

export function decidePhoneVerdict(
  input: PhoneVerdictDecisionInput,
  nowMilliseconds: number = Date.now()
): PhoneVerdictDecision {
  const proofOfLife = input.proofAnnotations.phone_webauthn_attested === true;
  let verdict: PhoneVerdictDecision['verdict'];
  let reason: string;
  let annotations: Record<string, unknown>;

  if (input.proofRequired && !proofOfLife) {
    verdict = 'failed';
    reason = 'no_proof_of_life';
    annotations = {
      desktop_projection_present: Boolean(input.desktopProjection),
      phone_projection_present: Boolean(input.phoneProjection),
      ...input.proofAnnotations,
    };
  } else if (!input.desktopScan || !input.phoneScan) {
    verdict = 'failed';
    reason = 'projection_lookup_failed';
    annotations = {
      score_lookup_skipped: true,
      desktop_projection_present: Boolean(input.desktopProjection),
      phone_projection_present: Boolean(input.phoneProjection),
      ...input.proofAnnotations,
    };
  } else if (
    !isProjectionFresh(input.desktopProjection, nowMilliseconds) ||
    !isProjectionFresh(input.phoneProjection, nowMilliseconds)
  ) {
    verdict = 'failed';
    reason = 'projection_stale';
    annotations = {
      desktop_projection_age_sec: projectionAgeSeconds(input.desktopProjection, nowMilliseconds),
      phone_projection_age_sec: projectionAgeSeconds(input.phoneProjection, nowMilliseconds),
      freshness_window_sec: PROJECTION_FRESHNESS_WINDOW_SECONDS,
      ...input.proofAnnotations,
    };
  } else {
    const computed = computeProjectionVerdict(input.desktopScan, input.phoneScan);
    verdict = computed.verdict;
    reason = computed.reason;
    annotations = {
      ...computed.annotations,
      ...input.proofAnnotations,
      proof_of_life: proofOfLife,
    };
  }

  return {
    verdict,
    reason,
    proofOfLife,
    annotations: { ...annotations, ...input.hostAnnotations },
  };
}
