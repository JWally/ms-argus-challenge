import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  openBytes,
  unpackDrawingPictureBundle,
  unpackQrFrameBundle,
} from '@argus-challenge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

const baseUrl = requiredEnvironment('CHALLENGE_BASE_URL').replace(/\/$/, '');
const webSocketUrl = requiredEnvironment('CHALLENGE_WS_URL');
const cpi = requiredEnvironment('CHALLENGE_CPI');
const sockets: WebSocket[] = [];

interface StartedSession {
  sessionId: string;
  nonce: string;
  expiresAt: number;
  ws: { url: string; desktopToken: string; phoneToken: string };
}

interface Identity {
  action: 'whoami';
  envelope: string;
  sessionId: string;
  role: 'desktop' | 'phone';
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live infrastructure tests`);
  return value;
}

async function json(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, body };
}

async function startSession(): Promise<StartedSession> {
  const challengeId = `live_${crypto.randomUUID().replaceAll('-', '')}`;
  const { response, body } = await json('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({ cpi: `${cpi}.fastpass`, challengeId }),
  });
  expect(response.status).toBe(200);
  return body as unknown as StartedSession;
}

function nextMessage<T>(socket: WebSocket, accept: (value: unknown) => value is T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('websocket_message_timeout')), 10_000);
    const listener = (event: MessageEvent): void => {
      const value: unknown = JSON.parse(String(event.data));
      if (!accept(value)) return;
      clearTimeout(timer);
      socket.removeEventListener('message', listener);
      resolve(value);
    };
    socket.addEventListener('message', listener);
  });
}

function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.action === 'whoami' &&
    typeof message.envelope === 'string' &&
    typeof message.sessionId === 'string' &&
    ['desktop', 'phone'].includes(String(message.role))
  );
}

async function identify(token: string): Promise<{ socket: WebSocket; identity: Identity }> {
  const socket = new WebSocket(webSocketUrl);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('websocket_open_failed')), {
      once: true,
    });
  });
  const identity = nextMessage(socket, isIdentity);
  socket.send(
    JSON.stringify({ action: 'whoami', token, origin: baseUrl, publicKey: 'live-test-key' })
  );
  return { socket, identity: await identity };
}

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

describe('deployed challenge stack', () => {
  it('serves the private static site, loader, and keyholder worker', async () => {
    const [site, loader, worker] = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/captcha.js`),
      fetch(`${baseUrl}/qr-worker.js`),
    ]);
    expect(site.status).toBe(200);
    expect(site.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(await site.text()).toContain('Argus Challenge');
    expect(loader.status).toBe(200);
    expect((await loader.text()).length).toBeGreaterThan(100);
    expect(worker.status).toBe(200);
    expect((await worker.text()).length).toBeGreaterThan(100);
  });

  it('fails malformed and cross-origin session requests closed', async () => {
    const forbidden = await json('/api/session/start', {
      method: 'POST',
      headers: { origin: 'https://attacker.invalid' },
      body: JSON.stringify({ cpi, challengeId: 'abcdefghijklmnop' }),
    });
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'origin_not_allowed' });

    const malformed = await json('/api/session/start', {
      method: 'POST',
      body: '{',
    });
    expect(malformed.response.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_body' });
  });

  it('creates real Dynamo state and authenticates both WebSocket roles', async () => {
    const session = await startSession();
    expect(session.ws.url).toBe(webSocketUrl);
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);

    const info = await json(`/api/session/${session.sessionId}/info`);
    expect(info.body).toMatchObject({ desktopReady: false, verdict: 'pending' });
    const unauthorized = await json(`/api/session/${session.sessionId}/result`);
    expect(unauthorized.response.status).toBe(401);

    const [desktop, phone] = await Promise.all([
      identify(session.ws.desktopToken),
      identify(session.ws.phoneToken),
    ]);
    expect(desktop.identity).toMatchObject({ role: 'desktop', sessionId: session.sessionId });
    expect(phone.identity).toMatchObject({ role: 'phone', sessionId: session.sessionId });

    const relayed = nextMessage(desktop.socket, (value): value is Record<string, unknown> => {
      const message = value as Record<string, unknown>;
      return message.action === 'message' && message.from === 'phone';
    });
    phone.socket.send(
      JSON.stringify({
        action: 'message',
        me: phone.identity.envelope,
        peer: desktop.identity.envelope,
        data: { kind: 'phone-here', challenge: true },
      })
    );
    expect(await relayed).toMatchObject({
      sessionId: session.sessionId,
      data: { kind: 'phone-here', challenge: true },
    });
  });

  it('returns client-decryptable QR frames without trusting worker claims', async () => {
    const session = await startSession();
    const desktop = await identify(session.ws.desktopToken);
    const client = await generateKeyPair();
    const cPub = await exportPublicKey(client.publicKey);
    const result = await json(
      `/api/session/${session.sessionId}/pair-token?t=${encodeURIComponent(session.ws.desktopToken)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          wsUrl: session.ws.url,
          e: desktop.identity.envelope,
          pt: session.ws.phoneToken,
          n: session.nonce,
          cPub,
          debug: false,
        }),
      }
    );
    expect(result.response.status).toBe(200);
    expect(result.body).toMatchObject({ kind: 'png-frames', compression: 'none', frameCount: 4 });
    const serverPublicKey = await importPublicKey(String(result.body.sPub));
    const key = await deriveAesKey(client.privateKey, serverPublicKey);
    const bundle = unpackQrFrameBundle(await openBytes(key, String(result.body.enc)));
    expect(bundle.frames).toHaveLength(4);
    expect(bundle.frames.every((frame) => frame.byteLength > 1_000)).toBe(true);
  });

  it('returns four horizontally partitioned server-rendered PNG frames per prompt to the authenticated phone', async () => {
    const session = await startSession();
    const client = await generateKeyPair();
    const clientPublicKey = await exportPublicKey(client.publicKey);
    const result = await json(`/api/session/${session.sessionId}/drawing-pictures`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.ws.phoneToken}` },
      body: JSON.stringify({ clientPublicKey }),
    });

    expect(result.response.status).toBe(200);
    expect(result.body).toMatchObject({
      kind: 'drawing-pictures',
      encoding: 'png',
      compression: 'none',
      framesPerPrompt: 4,
      frameMs: 30,
      pictureCount: 12,
      letters: [
        expect.stringMatching(/^[A-HJ-NP-Z]$/),
        expect.stringMatching(/^[A-HJ-NP-Z]$/),
        expect.stringMatching(/^[A-HJ-NP-Z]$/),
      ],
    });
    const serverPublicKey = await importPublicKey(String(result.body.sPub));
    const key = await deriveAesKey(client.privateKey, serverPublicKey);
    const bundle = unpackDrawingPictureBundle(await openBytes(key, String(result.body.enc)));
    expect(bundle.pictures).toHaveLength(12);
    expect(bundle.pictures.every((picture) => picture.byteLength > 1_000)).toBe(true);
    expect(
      bundle.pictures.every((picture) =>
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (byte, index) => picture[index] === byte
        )
      )
    ).toBe(true);
  });
});
