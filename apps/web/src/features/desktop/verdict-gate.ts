import {
  decodeVerdictRevealKey,
  openFixedVerdictEnvelope,
  type FixedVerdictPayload,
  type SealedVerdictEnvelope,
} from '@argus-challenge/contracts/verdicts/fixed-envelope';
import type { DesktopVerdict } from './desktop-types.js';

type OpenEnvelope = (
  key: Uint8Array,
  sessionId: string,
  envelope: SealedVerdictEnvelope
) => Promise<FixedVerdictPayload>;

export interface VerdictGate {
  result: Promise<DesktopVerdict>;
  receiveEnvelope(envelope: SealedVerdictEnvelope): Promise<void>;
  receiveKey(key: string): Promise<void>;
  fail(error: unknown): void;
  settled(): boolean;
}

export function createVerdictGate(
  sessionId: string,
  open: OpenEnvelope = openFixedVerdictEnvelope,
  decode: (value: string) => Uint8Array = decodeVerdictRevealKey
): VerdictGate {
  let envelope: SealedVerdictEnvelope | null = null;
  let revealKey: string | null = null;
  let isSettled = false;
  let opening = false;
  let resolveResult!: (value: DesktopVerdict) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<DesktopVerdict>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const fail = (error: unknown): void => {
    if (isSettled) return;
    isSettled = true;
    rejectResult(error);
  };
  const tryOpen = async (): Promise<void> => {
    if (isSettled || opening || !envelope || !revealKey) return;
    opening = true;
    try {
      const payload = await open(decode(revealKey), sessionId, envelope);
      if (payload.kind !== 'desktop-verdict') throw new Error('unexpected_verdict_payload');
      isSettled = true;
      resolveResult(payload);
    } catch (error) {
      fail(error);
    } finally {
      opening = false;
    }
  };
  return {
    result,
    async receiveEnvelope(value) {
      envelope = value;
      await tryOpen();
    },
    async receiveKey(value) {
      revealKey = value;
      await tryOpen();
    },
    fail,
    settled: () => isSettled,
  };
}
