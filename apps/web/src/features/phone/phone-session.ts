import type { SealedVerdictEnvelope } from '@argus-challenge/contracts/verdicts/fixed-envelope';
import { DEFAULT_CPI, runAttestedScan, type AttestedScan } from '../../shared/argus.js';
import { connectRelay, type PeerMessage, type RelayConnection } from '../../shared/websocket.js';
import { readPhoneBinding, type PhoneBinding } from './phone-binding.js';

export interface DesktopReady {
  kind: 'desktop-ready';
  nonce: string;
  expiresAt: number;
  desktopArgusSessionId: string;
  desktopKeyId: string;
}

export interface PhoneSession {
  sessionId: string;
  binding: PhoneBinding;
  connection: RelayConnection;
  ready: DesktopReady;
  scan: Promise<AttestedScan>;
  revealKey(): Promise<string>;
}

interface ExpectedReady {
  sessionId: string;
  desktopEnvelope: string;
  nonce: string;
}

export function readDesktopReady(
  message: PeerMessage,
  expected: ExpectedReady
): DesktopReady | null {
  if (
    message.from !== 'desktop' ||
    message.fromEnvelope !== expected.desktopEnvelope ||
    message.sessionId !== expected.sessionId ||
    !message.data ||
    typeof message.data !== 'object'
  ) {
    return null;
  }
  const data = message.data as Record<string, unknown>;
  return data.kind === 'desktop-ready' &&
    data.nonce === expected.nonce &&
    typeof data.expiresAt === 'number' &&
    typeof data.desktopArgusSessionId === 'string' &&
    typeof data.desktopKeyId === 'string'
    ? (data as unknown as DesktopReady)
    : null;
}

function revealKey(connection: RelayConnection, sessionId: string): Promise<string> {
  return connection
    .waitFor((message) => {
      const data = message.data as Record<string, unknown> | null;
      return (
        message.from === 'server' &&
        message.sessionId === sessionId &&
        data?.kind === 'verdict-release' &&
        typeof data.revealKey === 'string'
      );
    }, 95_000)
    .then((message) => String((message.data as Record<string, unknown>).revealKey));
}

export function readPhoneState(value: unknown): SealedVerdictEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SealedVerdictEnvelope>;
  return candidate.v === 1 && candidate.algorithm === 'A256GCM'
    ? (candidate as SealedVerdictEnvelope)
    : null;
}

export async function startPhoneSession(sessionId: string): Promise<PhoneSession> {
  const binding = readPhoneBinding(window.location.hash);
  const scan = runAttestedScan({
    cpi: DEFAULT_CPI,
    payload: { sessionId, nonce: binding.nonce, role: 'phone' },
  });
  void scan.catch(() => undefined);
  const connection = await connectRelay({ url: binding.wsUrl, token: binding.phoneToken });
  if (connection.role !== 'phone' || connection.sessionId !== sessionId) {
    connection.close();
    throw new Error('phone_session_identity_mismatch');
  }
  const key = revealKey(connection, sessionId);
  connection.send(binding.desktopEnvelope, { kind: 'phone-here', challenge: true });
  const message = await connection.waitFor(
    (candidate) =>
      readDesktopReady(candidate, {
        sessionId,
        desktopEnvelope: binding.desktopEnvelope,
        nonce: binding.nonce,
      }) !== null,
    60_000
  );
  const ready = readDesktopReady(message, {
    sessionId,
    desktopEnvelope: binding.desktopEnvelope,
    nonce: binding.nonce,
  });
  if (!ready || ready.expiresAt * 1_000 <= Date.now()) throw new Error('session_expired');
  return {
    sessionId,
    binding,
    connection,
    ready,
    scan,
    revealKey: () => key,
  };
}
