import { randomBytes, randomUUID } from 'node:crypto';
import { createServerQrRendererPrimer, sealPairTokenQr } from '@argus-challenge/adapters/qr';
import {
  INDIVIDUAL_SCORE_LIMIT,
  classifyProjection,
  collectDesktopEvidence,
  createDesktopAttestationHandler,
  createPairTokenMintHandler,
  createPhoneAttestationHandler,
  createSessionResultHandler,
  createVerdictTokenHandler,
  mintPairToken,
  prepareDesktopAttestation,
  preparePhoneAttestation,
  redeemPairToken,
  startSession,
  verifyVerdict,
  type ChallengeApiEvent,
} from '@argus-challenge/core';
import { verifyPhoneProof } from './proof-runtime.js';
import type { SharedRuntime } from './shared-runtime.js';

function participantToken(event: unknown): string {
  const request = event as {
    queryStringParameters?: Record<string, string | undefined>;
    headers?: Record<string, string | undefined>;
  };
  const authorization = request.headers?.authorization ?? request.headers?.Authorization ?? '';
  return request.queryStringParameters?.t ?? authorization.replace(/^Bearer\s+/i, '');
}

async function authenticateParticipant(
  runtime: SharedRuntime,
  event: unknown,
  sessionId: string
): Promise<boolean> {
  const token = participantToken(event);
  const claims = token ? await runtime.webSocketCrypto.verifyBootstrapToken(token) : null;
  return claims?.sessionId === sessionId;
}

function desktopSummary(runtime: SharedRuntime, argusSessionId: string) {
  return runtime.fetchProjection(argusSessionId).then((projection) => {
    if (!projection) return null;
    const scan = classifyProjection(projection);
    return {
      clean:
        scan.patAttested &&
        !scan.isProxy &&
        !scan.isDatacenter &&
        scan.individualScore < INDIVIDUAL_SCORE_LIMIT,
      summary: {
        score: scan.individualScore,
        pat_attested: scan.patAttested,
        is_proxy: scan.isProxy,
        is_datacenter: scan.isDatacenter,
        is_vpn: scan.isVpn,
        browser_name: scan.browserName,
        browser_version: scan.browserVersion,
        os: scan.os,
      },
    };
  });
}

function sessionStart(runtime: SharedRuntime) {
  return (body: Record<string, unknown>, viewerIp: string) =>
    startSession(body, viewerIp, {
      rateLimiter: runtime.startRateLimiter,
      sessions: runtime.sessions,
      bootstrapTokens: { mint: runtime.webSocketCrypto.mintBootstrapToken },
      ids: {
        sessionId: randomUUID,
        nonce: () => randomBytes(32).toString('base64url'),
      },
      clock: { nowEpochSeconds: runtime.nowEpochSeconds },
      logger: { info: console.info, warn: console.warn },
      sessionTtlSeconds: runtime.config.sessionTtlSeconds,
      proofRequiredByDefault: runtime.config.proofRequiredByDefault,
      webSocketUrl: runtime.config.webSocketUrl,
    });
}

function receivedAt(value: unknown): number | undefined {
  return value &&
    typeof value === 'object' &&
    'receivedAt' in value &&
    typeof value.receivedAt === 'number'
    ? value.receivedAt
    : undefined;
}

async function completedSession(runtime: SharedRuntime, sessionId: string) {
  const session = await runtime.sessions.load(sessionId);
  if (!session) return null;
  const phoneReceivedAt = receivedAt(session.phoneAttestation);
  return {
    verdict: session.verdict,
    ...(session.verdictReason ? { verdictReason: session.verdictReason } : {}),
    ...(session.annotations ? { annotations: session.annotations } : {}),
    ...(phoneReceivedAt ? { phoneAttestation: { receivedAt: phoneReceivedAt } } : {}),
  };
}

async function tokenSession(runtime: SharedRuntime, sessionId: string) {
  const session = await runtime.sessions.load(sessionId);
  if (!session) return null;
  const phoneReceivedAt = receivedAt(session.phoneAttestation);
  return {
    cpi: session.cpi,
    challengeId: session.challengeId,
    verdict: session.verdict,
    ...(session.verdictReason ? { verdictReason: session.verdictReason } : {}),
    ...(phoneReceivedAt ? { phoneAttestation: { receivedAt: phoneReceivedAt } } : {}),
  };
}

function desktopAttestation(runtime: SharedRuntime) {
  return createDesktopAttestationHandler({
    loadSession: runtime.sessions.load,
    prepare: (body, session) =>
      prepareDesktopAttestation(body, session, {
        verifier: runtime.attestationVerifier,
        claimArgusSession: runtime.attestations.claimArgusSession,
        nowEpochSeconds: runtime.nowEpochSeconds,
      }),
    store: runtime.attestations.storeDesktopAttestation,
    classifyDesktop: (sessionId) => desktopSummary(runtime, sessionId),
    warn: console.warn,
  });
}

function phoneAttestation(runtime: SharedRuntime) {
  return createPhoneAttestationHandler({
    prepare: (body, sessionId) =>
      preparePhoneAttestation(body, sessionId, {
        loadSession: runtime.sessions.load,
        verifier: runtime.attestationVerifier,
        openDesktopEnvelope: runtime.webSocketCrypto.openEnvelope,
        claimPhoneArgusSession: (argusId, pairId) =>
          runtime.attestations.claimArgusSession(argusId, pairId, 'phone'),
        nowEpochSeconds: runtime.nowEpochSeconds,
      }),
    verifyDeviceTrust: async (token, ip, publicKey) =>
      runtime.deviceTrust.verify(token, ip, publicKey),
    verifyProof: (input) => verifyPhoneProof(runtime, input),
    collectDesktopEvidence: (input) =>
      collectDesktopEvidence(input, {
        fetchProjection: runtime.fetchProjection,
        nowMilliseconds: Date.now,
      }),
    fetchPhoneProjection: runtime.fetchProjection,
    mintDeviceTrust: async (publicKey, keyId, ip) => runtime.deviceTrust.mint(publicKey, keyId, ip),
    commit: runtime.phoneCommit,
    deliverVerdict: runtime.disclosure.deliver,
    nowEpochSeconds: runtime.nowEpochSeconds,
    proofRequiredByDefault: runtime.config.proofRequiredByDefault,
  });
}

export function createPairRuntime(runtime: SharedRuntime) {
  const authenticate = (event: unknown, sessionId: string) =>
    authenticateParticipant(runtime, event, sessionId);
  const primeQrRenderer = createServerQrRendererPrimer(runtime.config.publicOrigin);
  const sealQr = (input: Parameters<typeof sealPairTokenQr>[0]) =>
    sealPairTokenQr(input, {
      recordProfile: (profile) => console.info(JSON.stringify(profile)),
    });
  return {
    startSession: sessionStart(runtime),
    attestDesktop: desktopAttestation(runtime),
    attestPhone: phoneAttestation(runtime),
    getSessionResult: createSessionResultHandler({
      authenticateParticipant: authenticate,
      loadSession: (sessionId) => completedSession(runtime, sessionId),
      sealResult: runtime.disclosure.buildResult,
      nowEpochSeconds: runtime.nowEpochSeconds,
    }),
    mintPairToken: createPairTokenMintHandler({
      authenticateParticipant: authenticate,
      loadSession: runtime.sessions.load,
      mintToken: (blob) => mintPairToken(runtime.singleUseTokens, blob),
      sealQr: async (input) => ({ ...(await sealQr(input)) }),
      pairOrigin: runtime.config.publicOrigin,
      proofRequiredByDefault: runtime.config.proofRequiredByDefault,
      warn: console.warn,
    }),
    redeemPairToken: (token: string) => redeemPairToken(runtime.singleUseTokens, token),
    mintVerdictToken: createVerdictTokenHandler({
      loadSession: (sessionId) => tokenSession(runtime, sessionId),
      verifyParticipant: runtime.webSocketCrypto.verifyBootstrapToken,
      isReleased: runtime.disclosure.isReleased,
      getSecret: runtime.verdictSecret.get,
      nowEpochSeconds: runtime.nowEpochSeconds,
    }),
    verifyVerdict: (body: Record<string, unknown>) =>
      verifyVerdict(body, { verdictSecret: runtime.verdictSecret }),
    loadSession: runtime.sessions.load,
    primeQrRenderer,
  };
}

export function originAllowed(runtime: SharedRuntime, event: ChallengeApiEvent): boolean {
  const origin = event.headers?.origin ?? event.headers?.Origin;
  return !origin || runtime.config.allowedOrigins.includes(origin);
}
