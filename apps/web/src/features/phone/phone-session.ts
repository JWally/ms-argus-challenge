import type { SealedVerdictEnvelope } from '@argus-challenge/contracts/verdicts/fixed-envelope';
import { DEFAULT_CPI, runAttestedScan, type AttestedScan } from '../../shared/argus.js';
import { requestJson } from '../../shared/http.js';
import { connectRelay, type PeerMessage, type RelayConnection } from '../../shared/websocket.js';
import type {
  DrawingPictureEncoding,
  RenderedDrawingPictures,
} from '../drawing/drawing-picture-protocol.js';
import { QrKeyholder } from '../qr/qr-keyholder.js';
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
  ready: Promise<DesktopReady>;
  pictures: RenderedDrawingPictures;
  expectedLetters: string[];
  scan: Promise<AttestedScan>;
  revealKey(): Promise<string>;
}

interface SealedDrawingPicturesResponse {
  enc: string;
  sPub: string;
  kind: 'drawing-pictures';
  encoding: DrawingPictureEncoding;
  compression: 'none';
  width: number;
  height: number;
  framesPerPrompt: number;
  frameMs: number;
  pictureCount: number;
  letters: string[];
}

interface PhoneDrawingChallenge {
  pictures: RenderedDrawingPictures;
  expectedLetters: string[];
}

interface DrawingPictureKeyholder {
  key(): Promise<{ clientPublicKey: string }>;
  openDrawingPictures(sealed: SealedDrawingPicturesResponse): Promise<RenderedDrawingPictures>;
  close(): void;
}

interface OpenServerDrawingPictureDependencies {
  keyholder: DrawingPictureKeyholder;
  request: typeof requestJson;
}

interface ExpectedReady {
  sessionId: string;
  desktopEnvelope: string;
  nonce: string;
}

interface StartPhoneSessionDependencies {
  hash: string;
  openPictures(sessionId: string, binding: PhoneBinding): Promise<PhoneDrawingChallenge>;
  scan(input: { cpi: string; payload: Record<string, unknown> }): Promise<AttestedScan>;
  connect(input: { url: string; token: string }): Promise<RelayConnection>;
  nowMs(): number;
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

async function waitForDesktopReady(input: {
  connection: RelayConnection;
  sessionId: string;
  binding: PhoneBinding;
  nowMs: () => number;
}): Promise<DesktopReady> {
  const expected = {
    sessionId: input.sessionId,
    desktopEnvelope: input.binding.desktopEnvelope,
    nonce: input.binding.nonce,
  };
  const message = await input.connection.waitFor(
    (candidate) => readDesktopReady(candidate, expected) !== null,
    60_000
  );
  const ready = readDesktopReady(message, expected);
  if (!ready || ready.expiresAt * 1_000 <= input.nowMs()) throw new Error('session_expired');
  return ready;
}

export function readPhoneState(value: unknown): SealedVerdictEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SealedVerdictEnvelope>;
  return candidate.v === 1 && candidate.algorithm === 'A256GCM'
    ? (candidate as SealedVerdictEnvelope)
    : null;
}

export async function openServerDrawingPictures(
  sessionId: string,
  binding: PhoneBinding,
  dependencies: OpenServerDrawingPictureDependencies = {
    keyholder: new QrKeyholder(),
    request: requestJson,
  }
): Promise<PhoneDrawingChallenge> {
  try {
    const key = await dependencies.keyholder.key();
    const sealed = await dependencies.request<SealedDrawingPicturesResponse>(
      `/api/session/${sessionId}/drawing-pictures`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${binding.phoneToken}` },
        body: JSON.stringify({ clientPublicKey: key.clientPublicKey }),
      }
    );
    if (
      !Array.isArray(sealed.letters) ||
      sealed.letters.length !== 3 ||
      sealed.letters.some((letter) => typeof letter !== 'string' || !/^[A-Z]$/.test(letter))
    ) {
      throw new Error('drawing_targets_invalid');
    }
    return {
      pictures: await dependencies.keyholder.openDrawingPictures(sealed),
      expectedLetters: sealed.letters,
    };
  } finally {
    dependencies.keyholder.close();
  }
}

export async function startPhoneSessionWithDependencies(
  sessionId: string,
  dependencies: StartPhoneSessionDependencies
): Promise<PhoneSession> {
  const binding = readPhoneBinding(dependencies.hash);
  const pictures = dependencies.openPictures(sessionId, binding);
  const connection = await dependencies.connect({ url: binding.wsUrl, token: binding.phoneToken });
  if (connection.role !== 'phone' || connection.sessionId !== sessionId) {
    connection.close();
    throw new Error('phone_session_identity_mismatch');
  }
  const key = revealKey(connection, sessionId);
  const ready = waitForDesktopReady({
    connection,
    sessionId,
    binding,
    nowMs: dependencies.nowMs,
  });
  void ready.catch(() => undefined);
  connection.send(binding.desktopEnvelope, { kind: 'phone-here', challenge: true });
  const drawingChallenge = await pictures;
  const scan = dependencies.scan({
    cpi: DEFAULT_CPI,
    payload: { sessionId, nonce: binding.nonce, role: 'phone' },
  });
  void scan.catch(() => undefined);
  return {
    sessionId,
    binding,
    connection,
    ready,
    pictures: drawingChallenge.pictures,
    expectedLetters: drawingChallenge.expectedLetters,
    scan,
    revealKey: () => key,
  };
}

export async function startPhoneSession(sessionId: string): Promise<PhoneSession> {
  return startPhoneSessionWithDependencies(sessionId, {
    hash: window.location.hash,
    openPictures: openServerDrawingPictures,
    scan: runAttestedScan,
    connect: connectRelay,
    nowMs: () => Date.now(),
  });
}
