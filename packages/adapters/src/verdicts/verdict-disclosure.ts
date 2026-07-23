import {
  encodeVerdictRevealKey,
  sealFixedVerdictEnvelope,
  type DesktopVerdictPayload,
  type PhoneStatePayload,
  type SealedVerdictEnvelope,
} from '@argus-challenge/contracts';
import { shouldReleaseVerdict, type ConnectionEnvelope } from '@argus-challenge/core';

interface DecisionInput {
  sessionId: string;
  verdict: 'paired' | 'failed';
  reason: string | null;
  annotations: Record<string, unknown>;
  nextDeviceTrust: string | null;
  decidedAt: number;
  now: number;
}

interface DisclosureDependencies {
  revealKey(sessionId: string): Promise<Uint8Array>;
  loadRevealState(sessionId: string): Promise<{ challenge: boolean; phoneDone: boolean } | null>;
  publishDesktop(connectionId: string, message: Record<string, unknown>): Promise<void>;
}

interface SealedDecision {
  desktop: SealedVerdictEnvelope;
  phone: SealedVerdictEnvelope;
  encodedKey: string;
  released: boolean;
}

async function sealDesktop(
  key: Uint8Array,
  sessionId: string,
  payload: DesktopVerdictPayload
): Promise<SealedVerdictEnvelope> {
  try {
    return await sealFixedVerdictEnvelope(key, sessionId, payload);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'verdict payload exceeds fixed envelope') {
      throw error;
    }
    return sealFixedVerdictEnvelope(key, sessionId, {
      ...payload,
      annotations: { verdict_annotations_truncated: true },
    });
  }
}

async function buildSealed(
  input: DecisionInput,
  dependencies: DisclosureDependencies
): Promise<SealedDecision> {
  const key = await dependencies.revealKey(input.sessionId);
  const desktopPayload: DesktopVerdictPayload = {
    kind: 'desktop-verdict',
    verdict: input.verdict,
    reason: input.reason,
    annotations: input.annotations,
  };
  const phonePayload: PhoneStatePayload = {
    kind: 'phone-state',
    verdict: input.verdict,
    nextDeviceTrust: input.nextDeviceTrust,
  };
  const [desktop, phone, state] = await Promise.all([
    sealDesktop(key, input.sessionId, desktopPayload),
    sealFixedVerdictEnvelope(key, input.sessionId, phonePayload),
    dependencies.loadRevealState(input.sessionId),
  ]);
  return {
    desktop,
    phone,
    encodedKey: encodeVerdictRevealKey(key),
    released: shouldReleaseVerdict(state, input.decidedAt, input.now),
  };
}

async function pushDecision(
  envelope: ConnectionEnvelope,
  input: DecisionInput,
  sealed: SealedDecision,
  dependencies: DisclosureDependencies
): Promise<void> {
  await dependencies.publishDesktop(envelope.connectionId, {
    action: 'message',
    from: 'server',
    sessionId: input.sessionId,
    data: { kind: 'verdict-sealed', envelope: sealed.desktop },
  });
  if (sealed.released) {
    await dependencies.publishDesktop(envelope.connectionId, {
      action: 'message',
      from: 'server',
      sessionId: input.sessionId,
      data: { kind: 'verdict-release', revealKey: sealed.encodedKey },
    });
  }
}

export function createVerdictDisclosure(dependencies: DisclosureDependencies) {
  return {
    async deliver(input: DecisionInput & { desktopEnvelope: ConnectionEnvelope }) {
      const sealed = await buildSealed(input, dependencies);
      await pushDecision(input.desktopEnvelope, input, sealed, dependencies);
      return {
        verdict: 'complete',
        reason: null,
        annotations: {},
        phoneState: sealed.phone,
        ...(sealed.released ? { revealKey: sealed.encodedKey } : {}),
      };
    },

    async buildResult(input: DecisionInput) {
      const sealed = await buildSealed(input, dependencies);
      return {
        status: 'sealed',
        envelope: sealed.desktop,
        ...(sealed.released ? { revealKey: sealed.encodedKey } : {}),
      };
    },

    async isReleased(sessionId: string, decidedAt: number, now: number) {
      return shouldReleaseVerdict(await dependencies.loadRevealState(sessionId), decidedAt, now);
    },
  };
}
