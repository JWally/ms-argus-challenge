export type ParticipantConnectionRole = 'desktop' | 'phone';

export interface BootstrapClaims {
  v: 1;
  sessionId: string;
  role: ParticipantConnectionRole;
  iat: number;
  exp: number;
}

export interface ConnectionEnvelope {
  v: 1;
  connectionId: string;
  sessionId: string;
  role: ParticipantConnectionRole;
  ip: string;
  origin: string;
  iat: number;
  publicKey?: string;
}

export interface WebSocketEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
    identity?: { sourceIp?: string };
  };
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string;
}

export interface WebSocketResponse {
  statusCode: number;
  body?: string;
}

export interface WebSocketRouterDependencies {
  allowedOrigins: ReadonlySet<string>;
  verifyBootstrapToken(token: string): Promise<BootstrapClaims | null>;
  claimRoleConnection(claims: BootstrapClaims, connectionId: string): Promise<boolean>;
  releaseRoleConnection(connectionId: string): Promise<void>;
  sealEnvelope(envelope: ConnectionEnvelope): Promise<string>;
  openEnvelope(blob: string): Promise<ConnectionEnvelope | null>;
  markPhoneChallenge(sessionId: string, challenge: boolean, expiresAt: number): Promise<void>;
  markPhoneDone(sessionId: string, expiresAt: number): Promise<void>;
  getVerdictRevealKey(sessionId: string): Promise<string>;
  sendToConnection(event: WebSocketEvent, connectionId: string, data: unknown): Promise<void>;
  nowEpochSeconds(): number;
  logInfo(message: string): void;
}

type ActionBody = { action?: string } & Record<string, unknown>;

const ENVELOPE_MAX_AGE_SECONDS = 60 * 60;
const VERDICT_MARKER_TTL_SECONDS = 6 * 60;

function ok(): WebSocketResponse {
  return { statusCode: 200 };
}

function bad(dependencies: WebSocketRouterDependencies, reason: string): WebSocketResponse {
  dependencies.logInfo(`[challenge-ws] rejected: ${reason}`);
  return { statusCode: 400, body: reason };
}

function parseBody(event: WebSocketEvent): ActionBody | null {
  if (!event.body) return {};
  try {
    const parsed: unknown = JSON.parse(event.body);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ActionBody)
      : {};
  } catch {
    return null;
  }
}

async function identify(
  event: WebSocketEvent,
  body: ActionBody,
  dependencies: WebSocketRouterDependencies
): Promise<WebSocketResponse> {
  if (typeof body.token !== 'string') return bad(dependencies, 'missing_token');
  const claims = await dependencies.verifyBootstrapToken(body.token);
  if (!claims) return bad(dependencies, 'invalid_token');
  const origin = typeof body.origin === 'string' ? body.origin : '';
  if (!dependencies.allowedOrigins.has(origin)) return bad(dependencies, 'origin_not_allowed');
  const connectionId = event.requestContext.connectionId;
  if (!(await dependencies.claimRoleConnection(claims, connectionId))) {
    return bad(dependencies, 'role_already_connected');
  }
  const envelope: ConnectionEnvelope = {
    v: 1,
    connectionId,
    sessionId: claims.sessionId,
    role: claims.role,
    ip: event.requestContext.identity?.sourceIp ?? '',
    origin,
    iat: dependencies.nowEpochSeconds(),
    ...(typeof body.publicKey === 'string' ? { publicKey: body.publicKey } : {}),
  };
  const sealed = await dependencies.sealEnvelope(envelope);
  await dependencies.sendToConnection(event, connectionId, {
    action: 'whoami',
    envelope: sealed,
    sessionId: claims.sessionId,
    role: claims.role,
  });
  return ok();
}

function relayError(
  event: WebSocketEvent,
  sender: ConnectionEnvelope,
  peer: ConnectionEnvelope,
  now: number
): string | null {
  if (sender.connectionId !== event.requestContext.connectionId) {
    return 'envelope_connection_mismatch';
  }
  if (sender.sessionId !== peer.sessionId) return 'cross_session';
  if (sender.role === peer.role) return 'same_role';
  if (now - sender.iat > ENVELOPE_MAX_AGE_SECONDS || now - peer.iat > ENVELOPE_MAX_AGE_SECONDS) {
    return 'envelope_expired';
  }
  return null;
}

function messageKind(data: unknown): unknown {
  return data && typeof data === 'object' && 'kind' in data
    ? (data as { kind?: unknown }).kind
    : null;
}

async function recordPhoneSignal(
  sender: ConnectionEnvelope,
  data: unknown,
  now: number,
  dependencies: WebSocketRouterDependencies
): Promise<boolean> {
  if (sender.role !== 'phone') return false;
  const kind = messageKind(data);
  const expiresAt = now + VERDICT_MARKER_TTL_SECONDS;
  if (kind === 'phone-here') {
    const challenge = (data as { challenge?: unknown }).challenge === true;
    await dependencies.markPhoneChallenge(sender.sessionId, challenge, expiresAt);
    return false;
  }
  if (kind !== 'phone-done') return false;
  await dependencies.markPhoneDone(sender.sessionId, expiresAt);
  return true;
}

async function releaseVerdict(
  event: WebSocketEvent,
  phone: ConnectionEnvelope,
  desktop: ConnectionEnvelope,
  dependencies: WebSocketRouterDependencies
): Promise<void> {
  const revealKey = await dependencies.getVerdictRevealKey(phone.sessionId);
  const release = {
    action: 'message',
    from: 'server',
    sessionId: phone.sessionId,
    data: { kind: 'verdict-release', revealKey },
  };
  await Promise.all([
    dependencies.sendToConnection(event, desktop.connectionId, release),
    dependencies.sendToConnection(event, phone.connectionId, release),
  ]);
}

async function relay(
  event: WebSocketEvent,
  body: ActionBody,
  dependencies: WebSocketRouterDependencies
): Promise<WebSocketResponse> {
  if (typeof body.me !== 'string' || typeof body.peer !== 'string') {
    return bad(dependencies, 'missing_envelopes');
  }
  const [sender, peer] = await Promise.all([
    dependencies.openEnvelope(body.me),
    dependencies.openEnvelope(body.peer),
  ]);
  if (!sender || !peer) return bad(dependencies, 'invalid_envelope');
  const now = dependencies.nowEpochSeconds();
  const invalidReason = relayError(event, sender, peer, now);
  if (invalidReason) return bad(dependencies, invalidReason);
  const shouldRelease = await recordPhoneSignal(sender, body.data, now, dependencies);
  await dependencies.sendToConnection(event, peer.connectionId, {
    action: 'message',
    from: sender.role,
    fromEnvelope: body.me,
    sessionId: sender.sessionId,
    data: body.data ?? null,
  });
  if (shouldRelease) await releaseVerdict(event, sender, peer, dependencies);
  return ok();
}

export function createWebSocketRouter(dependencies: WebSocketRouterDependencies) {
  return async (event: WebSocketEvent): Promise<WebSocketResponse> => {
    const { routeKey, connectionId } = event.requestContext;
    if (routeKey === '$connect') return ok();
    if (routeKey === '$disconnect') {
      await dependencies.releaseRoleConnection(connectionId);
      return ok();
    }
    const body = parseBody(event);
    if (!body) return bad(dependencies, 'invalid_json');
    if (body.action === 'whoami') return identify(event, body, dependencies);
    if (body.action === 'message') return relay(event, body, dependencies);
    return bad(dependencies, 'unknown_action');
  };
}
