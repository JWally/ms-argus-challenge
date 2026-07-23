import { baseIntegrityCpi, DEFAULT_CPI, runAttestedScan } from '../../shared/argus.js';
import { saveDeviceTrust } from '../../shared/device-trust.js';
import { HttpError, requestJson } from '../../shared/http.js';
import { saveSsoState, type SsoBrowserState } from './sso-state.js';

interface SsoStartResponse extends SsoBrowserState, Record<string, unknown> {
  expiresAt: number;
}

interface SsoChallengeResponse extends Record<string, unknown> {
  ok: true;
  returnCode: string;
  returnUrl: string;
}

export interface SsoValidateResponse extends Record<string, unknown> {
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

export interface SsoProofBody {
  deviceTrustToken?: string;
  webauthn?: unknown;
  oauth?: { provider: 'google'; token: string };
}

async function ssoLeg(cpi: string, payload: Record<string, unknown>) {
  return runAttestedScan({ cpi: baseIntegrityCpi(cpi), payload: { ...payload, cpi } });
}

export function defaultSsoCpi(): string {
  return `${baseIntegrityCpi(DEFAULT_CPI)}.stepup`;
}

export async function startSso(input: {
  cpi: string;
  challengeId: string;
  callbackUrl?: string;
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
      ...(input.callbackUrl
        ? {
            merchantChallengeId: input.challengeId,
            merchantCallbackUrl: input.callbackUrl,
          }
        : {}),
    }),
  });
  saveSsoState(response);
  return response;
}

export async function completeSsoChallenge(state: SsoBrowserState): Promise<SsoChallengeResponse> {
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

export async function submitSsoValidation(
  state: SsoBrowserState,
  returnCode: string,
  proof: SsoProofBody
): Promise<SsoValidateResponse> {
  const scan = await ssoLeg(state.cpi, {
    role: 'merchant-validate',
    ssoSessionId: state.sessionId,
    nonce: state.nonce,
    returnCode,
  });
  let result: SsoValidateResponse;
  try {
    result = await requestJson<SsoValidateResponse>(
      `/api/sso/${state.sessionId}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ ...scan, ...proof, returnCode }),
      },
      45_000
    );
  } catch (error) {
    const failed = failedVerdict(error);
    if (!failed) throw error;
    result = failed;
  }
  saveDeviceTrust(result.nextDeviceTrust ?? null);
  return result;
}

export function redeemSsoApproval(
  sessionId: string,
  cpi: string
): Promise<Record<string, unknown>> {
  return requestJson('/api/sso/approval/redeem', {
    method: 'POST',
    body: JSON.stringify({ sessionId, cpi }),
  });
}

export function validationDestination(state: SsoBrowserState, result: SsoValidateResponse): string {
  if (!result.merchantCallbackUrl || !result.merchantChallengeId) {
    return `/merchant?${new URLSearchParams({
      complete: '1',
      session: state.sessionId,
      cpi: state.cpi,
      status: result.verdict,
    })}`;
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
