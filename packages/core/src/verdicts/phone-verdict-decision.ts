import type { MerchantProjection } from '@argus-challenge/contracts';
import { evaluatePairProjectionBindings } from '../attestations/projection-device-binding.js';
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
  desktopPublicKey: string;
  phonePublicKey: string;
  hostAnnotations: Record<string, unknown>;
}

export interface PhoneVerdictDecision {
  verdict: 'paired' | 'failed';
  reason: string;
  annotations: Record<string, unknown>;
  proofOfLife: boolean;
}

type DecisionOutcome = Omit<PhoneVerdictDecision, 'proofOfLife'>;

function decideFromCompleteProjections(
  input: {
    desktopProjection: MerchantProjection;
    phoneProjection: MerchantProjection;
    desktopScan: ClassifiedProjection;
    phoneScan: ClassifiedProjection;
    desktopPublicKey: string;
    phonePublicKey: string;
    proofAnnotations: ProofAnnotations;
  },
  proofOfLife: boolean,
  nowMilliseconds: number
): DecisionOutcome {
  const binding = evaluatePairProjectionBindings(input);
  if (!binding.ok) {
    return {
      verdict: 'failed',
      reason: binding.reason,
      annotations: { ...binding.annotations, ...input.proofAnnotations },
    };
  }
  if (
    !isProjectionFresh(input.desktopProjection, nowMilliseconds) ||
    !isProjectionFresh(input.phoneProjection, nowMilliseconds)
  ) {
    return {
      verdict: 'failed',
      reason: 'projection_stale',
      annotations: {
        ...binding.annotations,
        desktop_projection_age_sec: projectionAgeSeconds(input.desktopProjection, nowMilliseconds),
        phone_projection_age_sec: projectionAgeSeconds(input.phoneProjection, nowMilliseconds),
        freshness_window_sec: PROJECTION_FRESHNESS_WINDOW_SECONDS,
        ...input.proofAnnotations,
      },
    };
  }
  const computed = computeProjectionVerdict(input.desktopScan, input.phoneScan);
  return {
    verdict: computed.verdict,
    reason: computed.reason,
    annotations: {
      ...binding.annotations,
      ...computed.annotations,
      ...input.proofAnnotations,
      proof_of_life: proofOfLife,
    },
  };
}

export function decidePhoneVerdict(
  input: PhoneVerdictDecisionInput,
  nowMilliseconds: number = Date.now()
): PhoneVerdictDecision {
  const proofOfLife = input.proofAnnotations.phone_webauthn_attested === true;
  let outcome: DecisionOutcome;

  if (input.proofRequired && !proofOfLife) {
    outcome = {
      verdict: 'failed',
      reason: 'no_proof_of_life',
      annotations: {
        desktop_projection_present: Boolean(input.desktopProjection),
        phone_projection_present: Boolean(input.phoneProjection),
        ...input.proofAnnotations,
      },
    };
  } else if (
    !input.desktopProjection ||
    !input.phoneProjection ||
    !input.desktopScan ||
    !input.phoneScan
  ) {
    outcome = {
      verdict: 'failed',
      reason: 'projection_lookup_failed',
      annotations: {
        score_lookup_skipped: true,
        desktop_projection_present: Boolean(input.desktopProjection),
        phone_projection_present: Boolean(input.phoneProjection),
        ...input.proofAnnotations,
      },
    };
  } else {
    outcome = decideFromCompleteProjections(
      {
        desktopProjection: input.desktopProjection,
        phoneProjection: input.phoneProjection,
        desktopScan: input.desktopScan,
        phoneScan: input.phoneScan,
        desktopPublicKey: input.desktopPublicKey,
        phonePublicKey: input.phonePublicKey,
        proofAnnotations: input.proofAnnotations,
      },
      proofOfLife,
      nowMilliseconds
    );
  }

  return {
    verdict: outcome.verdict,
    reason: outcome.reason,
    proofOfLife,
    annotations: { ...outcome.annotations, ...input.hostAnnotations },
  };
}
