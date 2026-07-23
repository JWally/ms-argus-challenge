import type { SealedVerdictEnvelope } from '@argus-challenge/contracts/verdicts/fixed-envelope';
import type { VerdictGate } from './verdict-gate.js';

interface SealedResult {
  status: 'sealed';
  envelope: SealedVerdictEnvelope;
  revealKey?: string;
}

function isSealedResult(value: unknown): value is SealedResult {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).status === 'sealed' &&
    (value as Record<string, unknown>).envelope
  );
}

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

async function pollOnce(input: {
  sessionId: string;
  token: string;
  gate: VerdictGate;
  signal: AbortSignal;
}): Promise<'pending' | 'sealed-pending' | 'stop'> {
  const response = await fetch(
    `/api/session/${input.sessionId}/result?t=${encodeURIComponent(input.token)}`,
    { credentials: 'same-origin', signal: input.signal }
  );
  if (response.status === 204) return 'pending';
  if (!response.ok) return 'stop';
  const body: unknown = await response.json();
  if (!isSealedResult(body)) return 'stop';
  await input.gate.receiveEnvelope(body.envelope);
  if (body.revealKey) {
    await input.gate.receiveKey(body.revealKey);
    return 'stop';
  }
  return 'sealed-pending';
}

export async function pollDesktopResult(input: {
  sessionId: string;
  token: string;
  gate: VerdictGate;
  signal: AbortSignal;
  initialDelayMs?: number;
}): Promise<void> {
  let delay = input.initialDelayMs ?? 15_000;
  while (!input.signal.aborted && !input.gate.settled()) {
    await wait(delay, input.signal);
    if (input.signal.aborted || input.gate.settled()) return;
    delay = Math.min(10_000, Math.max(1_500, Math.round(delay * 1.5)));
    try {
      const outcome = await pollOnce(input);
      if (outcome === 'stop') return;
      if (outcome === 'sealed-pending') delay = 500;
    } catch {
      if (!input.signal.aborted) delay = 2_000;
    }
  }
}
