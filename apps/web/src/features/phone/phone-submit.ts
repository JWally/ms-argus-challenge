import {
  decodeVerdictRevealKey,
  openFixedVerdictEnvelope,
  type SealedVerdictEnvelope,
} from '@argus-challenge/contracts/verdicts/fixed-envelope';
import { clearDeviceTrust, loadDeviceTrust, saveDeviceTrust } from '../../shared/device-trust.js';
import { HttpError, requestJson } from '../../shared/http.js';
import { proveWithPasskey } from '../../shared/passkeys.js';
import type { PhoneSession } from './phone-session.js';
import { readPhoneState } from './phone-session.js';

interface NeutralAttestationResponse extends Record<string, unknown> {
  verdict: 'complete';
  phoneState: SealedVerdictEnvelope;
  revealKey?: string;
}

function requestBody(
  session: PhoneSession,
  ready: Awaited<PhoneSession['ready']>,
  scan: Awaited<PhoneSession['scan']>,
  proof: unknown,
  trustToken: string | null
): Record<string, unknown> {
  return {
    ...scan,
    desktopEnvelope: session.binding.desktopEnvelope,
    desktopArgusSessionId: ready.desktopArgusSessionId,
    desktopKeyId: ready.desktopKeyId,
    ...(trustToken ? { deviceTrustToken: trustToken } : { webauthn: proof }),
  };
}

async function postAttestation(
  session: PhoneSession,
  body: Record<string, unknown>
): Promise<NeutralAttestationResponse> {
  const response = await requestJson<NeutralAttestationResponse>(
    `/api/session/${session.sessionId}/phone-attest`,
    { method: 'POST', body: JSON.stringify(body) },
    45_000
  );
  if (response.verdict !== 'complete' || !readPhoneState(response.phoneState)) {
    throw new Error('phone_response_invalid');
  }
  return response;
}

function isInvalidTrust(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    error.status === 401 &&
    ['device_trust_invalid', 'fresh_proof_required'].includes(error.code)
  );
}

async function openState(
  session: PhoneSession,
  response: NeutralAttestationResponse
): Promise<'paired' | 'failed'> {
  session.connection.send(session.binding.desktopEnvelope, { kind: 'phone-done' });
  const key = response.revealKey ?? (await session.revealKey());
  const state = await openFixedVerdictEnvelope(
    decodeVerdictRevealKey(key),
    session.sessionId,
    response.phoneState
  );
  if (state.kind !== 'phone-state') throw new Error('phone_state_invalid');
  saveDeviceTrust(state.nextDeviceTrust);
  return state.verdict;
}

async function freshProof(session: PhoneSession): Promise<unknown> {
  if (!session.binding.proofRequired) return { error: 'proof_not_required' };
  return proveWithPasskey(session.binding.nonce);
}

export async function submitPhoneChallenge(session: PhoneSession): Promise<'paired' | 'failed'> {
  const [scan, ready] = await Promise.all([session.scan, session.ready]);
  const trust = session.binding.freshProofRequired ? null : loadDeviceTrust();
  try {
    const proof = trust ? null : await freshProof(session);
    return await openState(
      session,
      await postAttestation(session, requestBody(session, ready, scan, proof, trust))
    );
  } catch (error) {
    if (!trust || !isInvalidTrust(error)) throw error;
    clearDeviceTrust();
    const proof = await freshProof(session);
    return openState(
      session,
      await postAttestation(session, requestBody(session, ready, scan, proof, null))
    );
  }
}
