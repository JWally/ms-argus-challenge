export interface VerdictRevealState {
  challenge: boolean;
  phoneDone: boolean;
}

export const REVEAL_CAP_SECONDS = 90;

export function shouldReleaseVerdict(
  state: VerdictRevealState | null,
  decidedAt: number,
  now: number
): boolean {
  if (!state?.challenge || state.phoneDone) return true;
  return now >= decidedAt + REVEAL_CAP_SECONDS;
}
