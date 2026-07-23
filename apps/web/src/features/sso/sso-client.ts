import { baseIntegrityCpi, runAttestedScan } from '../../shared/argus.js';
import { clearDeviceTrust, loadDeviceTrust, saveDeviceTrust } from '../../shared/device-trust.js';
import { HttpError, requestJson } from '../../shared/http.js';
import { proveWithPasskey } from '../../shared/passkeys.js';
import { saveSsoState, type SsoBrowserState } from './sso-state.js';

interface SsoStartResponse extends SsoBrowserState, Record<string, unknown> {
  expiresAt: number;
}

interface SsoChallengeResponse extends Record<string, unknown> {
  ok: true;
  returnCode: string;
  returnUrl: string;
}

interface SsoValidateResponse extends Record<string, unknown> {
  verdict: 'approved' | 'failed';
  reason: string;
  reasons: string[];
  merchantSessionId: string;
  cpi: string;
  approvalCode?: string;
  merchantCallbackUrl?: string;
  merchantChallengeId?: string;
  nextDeviceTrust?: string | null;
}

async function ssoLeg(cpi: string, payload: Record<string, unknown>) {
  return runAttestedScan({ cpi: baseIntegrityCpi(cpi), payload: { ...payload, cpi } });
}

export async function startSso(input: {
  cpi: string;
  challengeId: string;
  callbackUrl: string;
}): Promise<SsoStartResponse> {
  const scan = await ssoLeg(input.cpi, {
    role: 'merchant-start',
    merchantSessionId: input.challengeId,
  });
  const response = await requestJson<SsoStartResponse>('/api/sso/start', {
    method: 'POST',
    body: JSON.stringify({
      ...scan,
      cpi: input.cpi,
      merchantSessionId: input.challengeId,
      merchantChallengeId: input.challengeId,
      merchantCallbackUrl: input.callbackUrl,
    }),
  });
  saveSsoState(response);
  return response;
}

export async function completeSsoChallenge(state: SsoBrowserState) {
  const scan = await ssoLeg(state.cpi, {
    role: 'argus-challenge',
    ssoSessionId: state.sessionId,
    nonce: state.nonce,
  });
  return requestJson<SsoChallengeResponse>(`/api/sso/${state.sessionId}/challenge`, {
    method: 'POST',
    body: JSON.stringify(scan),
  });
}

function failedVerdict(error: unknown): SsoValidateResponse | null {
  return error instanceof HttpError &&
    error.status === 403 &&
    ['approved', 'failed'].includes(String(error.body.verdict))
    ? (error.body as SsoValidateResponse)
    : null;
}

async function postValidation(
  state: SsoBrowserState,
  returnCode: string,
  proof: Record<string, unknown>
): Promise<SsoValidateResponse> {
  const scan = await ssoLeg(state.cpi, {
    role: 'merchant-validate',
    ssoSessionId: state.sessionId,
    nonce: state.nonce,
    returnCode,
  });
  try {
    return await requestJson<SsoValidateResponse>(
      `/api/sso/${state.sessionId}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ ...scan, ...proof, returnCode }),
      },
      45_000
    );
  } catch (error) {
    const verdict = failedVerdict(error);
    if (verdict) return verdict;
    throw error;
  }
}

function trustAllowed(state: SsoBrowserState): string | null {
  return state.freshProofRequired ? null : loadDeviceTrust();
}

async function validationProof(state: SsoBrowserState): Promise<Record<string, unknown>> {
  if (!state.proofRequired) return {};
  return { webauthn: await proveWithPasskey(state.nonce) };
}

export async function validateSso(
  state: SsoBrowserState,
  returnCode: string
): Promise<SsoValidateResponse> {
  const trust = trustAllowed(state);
  try {
    const result = await postValidation(
      state,
      returnCode,
      trust ? { deviceTrustToken: trust } : await validationProof(state)
    );
    saveDeviceTrust(result.nextDeviceTrust ?? null);
    return result;
  } catch (error) {
    if (!(trust && error instanceof HttpError && error.status === 401)) throw error;
    clearDeviceTrust();
    const result = await postValidation(state, returnCode, await validationProof(state));
    saveDeviceTrust(result.nextDeviceTrust ?? null);
    return result;
  }
}

export function validationDestination(state: SsoBrowserState, result: SsoValidateResponse): string {
  if (!result.merchantCallbackUrl || !result.merchantChallengeId) {
    return `/merchant?${new URLSearchParams({ complete: '1', session: state.sessionId, cpi: state.cpi })}`;
  }
  const callback = new URL(result.merchantCallbackUrl);
  callback.searchParams.set('session', state.sessionId);
  callback.searchParams.set('cpi', state.cpi);
  callback.searchParams.set('challengeId', result.merchantChallengeId);
  if (result.verdict === 'approved' && result.approvalCode) {
    callback.searchParams.set('code', result.approvalCode);
  } else {
    callback.searchParams.set('status', 'failed');
  }
  return callback.toString();
}
