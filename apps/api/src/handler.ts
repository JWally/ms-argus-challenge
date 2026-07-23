import { createChallengeApiRouter, type ChallengeApiEvent } from '@argus-challenge/core';
import { toApiEvent, toLambdaResponse, type GatewayEvent } from './http-transport.js';
import { createPairRuntime, originAllowed } from './pair-runtime.js';
import { readRuntimeConfig } from './runtime-config.js';
import { buildSharedRuntime, type SharedRuntime } from './shared-runtime.js';
import { createSsoRuntime } from './sso-runtime.js';

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

export function createHttpApplication(runtime: SharedRuntime) {
  const pair = createPairRuntime(runtime);
  const sso = createSsoRuntime(runtime);
  return createChallengeApiRouter({
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
    getSessionResult: pair.getSessionResult,
    mintPairToken: pair.mintPairToken,
    redeemPairToken: pair.redeemPairToken,
    mintVerdictToken: pair.mintVerdictToken,
    verifyVerdict: pair.verifyVerdict,
  });
}

let application: Promise<ReturnType<typeof createHttpApplication>> | null = null;

function loadApplication() {
  application ??= buildSharedRuntime(readRuntimeConfig()).then(createHttpApplication);
  return application;
}

export async function handler(event: GatewayEvent) {
  try {
    const route = await loadApplication();
    return toLambdaResponse(await route(toApiEvent(event)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[challenge] unhandled HTTP error: ${message}`);
    return toLambdaResponse({ status: 500, body: { error: 'internal_error' } });
  }
}

export type ChallengeApplication = (
  event: ChallengeApiEvent
) => ReturnType<ReturnType<typeof createChallengeApiRouter>>;
