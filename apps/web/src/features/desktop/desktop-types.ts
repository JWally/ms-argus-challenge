import type { RenderedQrFrames } from '../qr/qr-protocol.js';

export interface SessionStart {
  sessionId: string;
  nonce: string;
  expiresAt: number;
  ws: {
    url: string;
    desktopToken: string;
    phoneToken: string;
  };
}

export interface DesktopVerdict {
  verdict: 'paired' | 'failed';
  reason: string | null;
  annotations: Record<string, unknown>;
}

export interface DesktopController {
  sessionId: string;
  expiresAt: number;
  qr: RenderedQrFrames;
  result: Promise<DesktopVerdict>;
  verdictToken(): Promise<string>;
  stop(): void;
}

export interface DesktopFlowEvents {
  status(message: string): void;
  phoneConnected(): void;
  error(error: unknown): void;
}
