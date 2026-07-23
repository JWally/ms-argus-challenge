import { withDeadline } from './deadline.js';

export interface PeerMessage {
  action: 'message';
  from: 'desktop' | 'phone' | 'server';
  fromEnvelope?: string;
  sessionId: string;
  data: unknown;
}

interface IdentityMessage {
  action: 'whoami';
  envelope: string;
  sessionId: string;
  role: 'desktop' | 'phone';
}

export interface RelayConnection {
  envelope: string;
  sessionId: string;
  role: 'desktop' | 'phone';
  send(peerEnvelope: string, data: unknown): void;
  subscribe(handler: (message: PeerMessage) => void): () => void;
  disconnected(handler: () => void): () => void;
  waitFor(predicate: (message: PeerMessage) => boolean, timeoutMs?: number): Promise<PeerMessage>;
  close(): void;
}

export function parseSocketJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function isPeerMessage(value: unknown): value is PeerMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.action === 'message' &&
    ['desktop', 'phone', 'server'].includes(String(message.from)) &&
    typeof message.sessionId === 'string'
  );
}

function isIdentity(value: unknown): value is IdentityMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.action === 'whoami' &&
    typeof message.envelope === 'string' &&
    typeof message.sessionId === 'string' &&
    ['desktop', 'phone'].includes(String(message.role))
  );
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('websocket_open_failed')), {
      once: true,
    });
  });
}

function waitForIdentity(socket: WebSocket, token: string, publicKey?: string) {
  const response = new Promise<IdentityMessage>((resolve) => {
    const listener = (event: MessageEvent): void => {
      const message = parseSocketJson(event.data);
      if (!isIdentity(message)) return;
      socket.removeEventListener('message', listener);
      resolve(message);
    };
    socket.addEventListener('message', listener);
    socket.send(
      JSON.stringify({
        action: 'whoami',
        token,
        origin: window.location.origin,
        ...(publicKey ? { publicKey } : {}),
      })
    );
  });
  return withDeadline(response, 10_000, 'websocket_identity');
}

function connectionFrom(socket: WebSocket, identity: IdentityMessage): RelayConnection {
  const messageHandlers = new Set<(message: PeerMessage) => void>();
  const disconnectHandlers = new Set<() => void>();
  socket.addEventListener('message', (event) => {
    const message = parseSocketJson(event.data);
    if (!isPeerMessage(message)) return;
    for (const handler of messageHandlers) handler(message);
  });
  const notifyDisconnect = (): void => {
    for (const handler of disconnectHandlers) handler();
  };
  socket.addEventListener('close', notifyDisconnect);
  socket.addEventListener('error', notifyDisconnect);
  return relayConnection(socket, identity, messageHandlers, disconnectHandlers);
}

function relayConnection(
  socket: WebSocket,
  identity: IdentityMessage,
  handlers: Set<(message: PeerMessage) => void>,
  disconnectHandlers: Set<() => void>
): RelayConnection {
  const subscribe = (handler: (message: PeerMessage) => void): (() => void) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };
  return {
    ...identity,
    send(peerEnvelope, data) {
      socket.send(
        JSON.stringify({ action: 'message', me: identity.envelope, peer: peerEnvelope, data })
      );
    },
    subscribe,
    disconnected(handler) {
      disconnectHandlers.add(handler);
      return () => disconnectHandlers.delete(handler);
    },
    waitFor(predicate, timeoutMs = 60_000) {
      const message = new Promise<PeerMessage>((resolve) => {
        const unsubscribe = subscribe((candidate) => {
          if (!predicate(candidate)) return;
          unsubscribe();
          resolve(candidate);
        });
      });
      return withDeadline(message, timeoutMs, 'peer_message');
    },
    close: () => socket.close(),
  };
}

export async function connectRelay(input: {
  url: string;
  token: string;
  publicKey?: string;
}): Promise<RelayConnection> {
  const socket = new WebSocket(input.url);
  await withDeadline(waitForOpen(socket), 10_000, 'websocket_open');
  const identity = await waitForIdentity(socket, input.token, input.publicKey);
  return connectionFrom(socket, identity);
}
