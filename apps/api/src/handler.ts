import { createChallengeApiRouter, type ChallengeApiEvent } from '@argus-challenge/core';
import { toApiEvent, toLambdaResponse, type GatewayEvent } from './http-transport.js';
import { createHttpWarmup, isHttpWarmupEvent, type HttpWarmupResult } from './http-warmup.js';
import { createPairRuntime, originAllowed } from './pair-runtime.js';
import { readRuntimeConfig } from './runtime-config.js';
import { buildSharedRuntime, type SharedRuntime } from './shared-runtime.js';
import { createSsoRuntime } from './sso-runtime.js';

const WARMUP_SESSION_ID = '__challenge_http_warmup__';

function telemetry(routeKey: string, body: Record<string, unknown>) {
  if (!['POST /api/phone-perf', 'POST /api/sso/telemetry'].includes(routeKey)) {
    return null;
  }
  console.info(
    JSON.stringify({
      event: routeKey.endsWith('phone-perf') ? 'phone_perf' : 'sso_telemetry',
      fields: Object.keys(body).slice(0, 32),
    })
  );
  return { status: 204, body: null };
}

export type ChallengeApplication = (
  event: ChallengeApiEvent
) => ReturnType<ReturnType<typeof createChallengeApiRouter>>;

export interface HttpApplication {
  route: ChallengeApplication;
  warm(): Promise<HttpWarmupResult>;
}

export function createHttpApplication(runtime: SharedRuntime): HttpApplication {
  const pair = createPairRuntime(runtime);
  const sso = createSsoRuntime(runtime);
  const route = createChallengeApiRouter({
    allowOrigin: (event) => originAllowed(runtime, event),
    handleTelemetry: telemetry,
    startSession: pair.startSession,
    startSso: sso.startSso,
    challengeSso: sso.challengeSso,
    validateSso: sso.validateSso,
    redeemSsoApproval: sso.redeemSsoApproval,
    exchangeSsoApproval: sso.exchangeSsoApproval,
    loadSession: pair.loadSession,
    attestDesktop: pair.attestDesktop,
    attestPhone: pair.attestPhone,
    getDrawingPictures: pair.getDrawingPictures,
    getSessionResult: pair.getSessionResult,
    mintPairToken: pair.mintPairToken,
    redeemPairToken: pair.redeemPairToken,
    mintVerdictToken: pair.mintVerdictToken,
    verifyVerdict: pair.verifyVerdict,
  });
  const warm = createHttpWarmup({
    warmSessionStore: () => runtime.sessions.load(WARMUP_SESSION_ID),
    primeQrRenderer: pair.primeQrRenderer,
    nowMilliseconds: () => Number(process.hrtime.bigint()) / 1_000_000,
    recordProfile: (profile) => console.info(JSON.stringify(profile)),
  });
  return { route, warm };
}

let application: Promise<HttpApplication> | null = null;

function loadApplication(): Promise<HttpApplication> {
  application ??= buildSharedRuntime(readRuntimeConfig()).then(createHttpApplication);
  return application;
}

export async function dispatchHttpEvent(currentApplication: HttpApplication, event: unknown) {
  if (isHttpWarmupEvent(event)) return currentApplication.warm();
  return toLambdaResponse(await currentApplication.route(toApiEvent(event as GatewayEvent)));
}

export async function handler(event: unknown) {
  try {
    return await dispatchHttpEvent(await loadApplication(), event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[challenge] unhandled HTTP error: ${message}`);
    return toLambdaResponse({ status: 500, body: { error: 'internal_error' } });
  }
}
