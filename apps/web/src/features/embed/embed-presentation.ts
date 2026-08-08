type EmbedCompletion = 'paired' | 'failed' | null;
export type EmbedPhase = 'scanning' | 'pairing' | 'verified' | 'expired' | 'failed';

export interface EmbedPresentation {
  phase: EmbedPhase;
  title: string;
  instruction: string;
  trackStatus: string;
}

const PRESENTATION: Record<EmbedPhase, Omit<EmbedPresentation, 'phase'>> = {
  scanning: {
    title: 'Scan with your phone',
    instruction: "Open your phone's camera and point it at the code.",
    trackStatus: 'WAITING FOR PHONE',
  },
  pairing: {
    title: 'Phone connected',
    instruction: 'Finishing check...',
    trackStatus: 'PHONE CONNECTED',
  },
  verified: {
    title: 'Verified',
    instruction: "You're all set",
    trackStatus: 'CHECK COMPLETE',
  },
  expired: {
    title: 'Session expired',
    instruction: 'Please reload to start a new challenge.',
    trackStatus: 'SESSION ENDED',
  },
  failed: {
    title: "Couldn't verify",
    instruction: 'Try again on a trusted network',
    trackStatus: 'CHECK ENDED',
  },
};

function phase(status: string, completion: EmbedCompletion, expired: boolean): EmbedPhase {
  if (expired) return 'expired';
  if (completion === 'paired') return 'verified';
  if (completion === 'failed') return 'failed';
  return status === 'Phone connected' ? 'pairing' : 'scanning';
}

export function embedPresentation(input: {
  status: string;
  completion: EmbedCompletion;
  expired: boolean;
}): EmbedPresentation {
  const currentPhase = phase(input.status, input.completion, input.expired);
  return { phase: currentPhase, ...PRESENTATION[currentPhase] };
}
