import type { SealedVerdictEnvelope } from '@argus-challenge/contracts/verdicts/fixed-envelope';
import { baseIntegrityCpi, runAttestedScan } from '../../shared/argus.js';
import { requestJson } from '../../shared/http.js';
import { connectRelay, type PeerMessage, type RelayConnection } from '../../shared/websocket.js';
import { QrKeyholder } from '../qr/qr-keyholder.js';
import { pollDesktopResult } from './result-poll.js';
import type { DesktopController, DesktopFlowEvents, SessionStart } from './desktop-types.js';
import { createVerdictGate, type VerdictGate } from './verdict-gate.js';
import { requireVerdictToken } from './verdict-token.js';

interface DesktopReady {
  kind: 'desktop-ready';
  nonce: string;
  expiresAt: number;
  desktopArgusSessionId: string;
  desktopKeyId: string;
}

function sessionRequest(cpi: string, challengeId: string) {
  return requestJson<SessionStart>('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({ cpi, challengeId }),
  });
}

async function desktopEvidence(session: SessionStart, cpi: string): Promise<DesktopReady> {
  const scan = await runAttestedScan({
    cpi: baseIntegrityCpi(cpi),
    payload: { sessionId: session.sessionId, nonce: session.nonce, role: 'desktop' },
  });
  await requestJson(`/api/session/${session.sessionId}/desktop-attest`, {
    method: 'POST',
    body: JSON.stringify(scan),
  });
  return {
    kind: 'desktop-ready',
    nonce: session.nonce,
    expiresAt: session.expiresAt,
    desktopArgusSessionId: scan.argusSessionId,
    desktopKeyId: scan.attestation.keyId,
  };
}

async function mintQr(session: SessionStart, connection: RelayConnection, keyholder: QrKeyholder) {
  const key = await keyholder.key();
  const sealed = await requestJson<{
    enc: string;
    sPub: string;
    kind?: 'png' | 'png-frames';
    compression?: 'none';
  }>(
    `/api/session/${session.sessionId}/pair-token?t=${encodeURIComponent(session.ws.desktopToken)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        wsUrl: session.ws.url,
        e: connection.envelope,
        pt: session.ws.phoneToken,
        n: session.nonce,
        cPub: key.clientPublicKey,
        workerUrl: key.workerUrl,
        workerSha256: key.workerSha256,
        debug: new URLSearchParams(window.location.search).get('debug') === 'true',
      }),
    }
  );
  return keyholder.render(sealed);
}

function sealedEnvelope(message: PeerMessage): SealedVerdictEnvelope | null {
  const data = message.data as Record<string, unknown> | null;
  return message.from === 'server' && data?.kind === 'verdict-sealed'
    ? (data.envelope as SealedVerdictEnvelope)
    : null;
}

function installRelay(input: {
  connection: RelayConnection;
  ready: Promise<DesktopReady>;
  events: DesktopFlowEvents;
  gate: VerdictGate;
  startPolling(): void;
}): void {
  let phoneEnvelope: string | null = null;
  let phoneNotified = false;
  const sendReady = async (): Promise<void> => {
    if (!phoneEnvelope) return;
    input.connection.send(phoneEnvelope, await input.ready);
  };
  input.connection.subscribe((message) => {
    const data = message.data as Record<string, unknown> | null;
    if (message.from === 'phone' && data?.kind === 'phone-here' && message.fromEnvelope) {
      phoneEnvelope = message.fromEnvelope;
      if (!phoneNotified) {
        phoneNotified = true;
        input.events.phoneConnected();
        input.startPolling();
      }
      void sendReady().catch(input.gate.fail);
    }
    const envelope = sealedEnvelope(message);
    if (envelope) void input.gate.receiveEnvelope(envelope);
    if (
      message.from === 'server' &&
      data?.kind === 'verdict-release' &&
      typeof data.revealKey === 'string'
    ) {
      void input.gate.receiveKey(data.revealKey);
    }
  });
  input.connection.disconnected(input.startPolling);
}

export async function startDesktopFlow(input: {
  cpi: string;
  challengeId: string;
  events: DesktopFlowEvents;
}): Promise<DesktopController> {
  input.events.status('Starting secure session');
  const session = await sessionRequest(input.cpi, input.challengeId);
  const evidence = desktopEvidence(session, input.cpi);
  const connection = await connectRelay({
    url: session.ws.url,
    token: session.ws.desktopToken,
  });
  const abort = new AbortController();
  const gate = createVerdictGate(session.sessionId);
  let polling: Promise<void> | null = null;
  const startPolling = (): void => {
    polling ??= pollDesktopResult({
      sessionId: session.sessionId,
      token: session.ws.desktopToken,
      gate,
      signal: abort.signal,
    });
  };
  installRelay({ connection, ready: evidence, events: input.events, gate, startPolling });
  void evidence.catch((error: unknown) => {
    input.events.error(error);
    gate.fail(error);
  });
  const keyholder = new QrKeyholder();
  try {
    const qr = await mintQr(session, connection, keyholder);
    input.events.status('Scan with your phone');
    const expiryTimer = globalThis.setTimeout(
      () => gate.fail(new Error('session_expired')),
      Math.max(0, session.expiresAt * 1_000 - Date.now())
    );
    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      qr,
      result: gate.result.finally(() => globalThis.clearTimeout(expiryTimer)),
      async verdictToken() {
        const response = await requestJson<unknown>(
          `/api/session/${session.sessionId}/verdict-token?t=${encodeURIComponent(session.ws.desktopToken)}`
        );
        return requireVerdictToken(response);
      },
      stop() {
        abort.abort();
        connection.close();
        gate.fail(new Error('cancelled'));
      },
    };
  } finally {
    keyholder.close();
  }
}
