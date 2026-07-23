import {
  authenticateExistingPasskey,
  clearPasskeyHint,
  createNewPasskey,
  hasPasskeyHint,
  rememberPasskeyCredential,
} from '../../shared/passkeys.js';
import { clearDeviceTrust, loadDeviceTrust } from '../../shared/device-trust.js';
import {
  isGoogleConfigured,
  runGoogleProof,
  type GoogleProof,
  type GoogleProofOutcome,
} from '../../shared/google-oauth.js';
import { HttpError } from '../../shared/http.js';
import { submitSsoValidation, type SsoProofBody, type SsoValidateResponse } from './sso-client.js';
import type { SsoBrowserState } from './sso-state.js';

export type SsoProofChoice = 'passkey-create' | 'passkey-auth' | 'google';

type InitialOutcome =
  | { kind: 'validated'; result: SsoValidateResponse; passkeySeen: boolean }
  | { kind: 'proof-required'; passkeySeen: boolean };

type ProofOutcome =
  | { kind: 'validated'; result: SsoValidateResponse; passkeySeen: boolean }
  | { kind: 'proof-error'; error: string; passkeySeen: boolean };

export interface SsoValidationDependencies {
  validate(
    state: SsoBrowserState,
    returnCode: string,
    proof: SsoProofBody
  ): Promise<SsoValidateResponse>;
  loadTrust(): string | null;
  clearTrust(): void;
  hasPasskeyHint(): boolean;
  clearPasskeyHint(): void;
  authenticatePasskey(nonce: string): Promise<unknown>;
  createPasskey(nonce: string): Promise<unknown>;
  rememberPasskey(credential: unknown): void;
  googleProof(nonce: string): Promise<GoogleProofOutcome>;
}

function passkeySeen(dependencies: SsoValidationDependencies): boolean {
  return dependencies.hasPasskeyHint();
}

async function validateInitial(
  dependencies: SsoValidationDependencies,
  state: SsoBrowserState,
  returnCode: string
): Promise<InitialOutcome> {
  const seen = passkeySeen(dependencies);
  if (!state.proofRequired) {
    return {
      kind: 'validated',
      result: await dependencies.validate(state, returnCode, {}),
      passkeySeen: seen,
    };
  }
  if (state.freshProofRequired) return { kind: 'proof-required', passkeySeen: seen };
  const trust = dependencies.loadTrust();
  if (!trust) return { kind: 'proof-required', passkeySeen: seen };
  try {
    return {
      kind: 'validated',
      result: await dependencies.validate(state, returnCode, { deviceTrustToken: trust }),
      passkeySeen: seen,
    };
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 401)) throw error;
    dependencies.clearTrust();
    return { kind: 'proof-required', passkeySeen: passkeySeen(dependencies) };
  }
}

function proofError(error: unknown): string {
  if (error instanceof HttpError && error.status === 401) return 'Proof required';
  return error instanceof Error ? error.message : String(error);
}

function googleBody(outcome: GoogleProofOutcome): SsoProofBody | null {
  return 'token' in outcome ? { oauth: outcome satisfies GoogleProof } : null;
}

interface PreparedProof {
  body: SsoProofBody;
  newPasskey?: unknown;
}

async function proofBody(
  dependencies: SsoValidationDependencies,
  state: SsoBrowserState,
  choice: SsoProofChoice
): Promise<PreparedProof> {
  if (choice === 'google') {
    const outcome = await dependencies.googleProof(state.nonce);
    const body = googleBody(outcome);
    if (!body) throw new Error('error' in outcome ? outcome.error : 'google_proof_failed');
    return { body };
  }
  const webauthn =
    choice === 'passkey-auth'
      ? await dependencies.authenticatePasskey(state.nonce)
      : await dependencies.createPasskey(state.nonce);
  return {
    body: { webauthn },
    ...(choice === 'passkey-create' ? { newPasskey: webauthn } : {}),
  };
}

async function validateProof(
  dependencies: SsoValidationDependencies,
  state: SsoBrowserState,
  returnCode: string,
  choice: SsoProofChoice
): Promise<ProofOutcome> {
  try {
    const proof = await proofBody(dependencies, state, choice);
    const result = await dependencies.validate(state, returnCode, proof.body);
    if (result.verdict === 'approved' && proof.newPasskey) {
      dependencies.rememberPasskey(proof.newPasskey);
    }
    return { kind: 'validated', result, passkeySeen: passkeySeen(dependencies) };
  } catch (error) {
    if (choice === 'passkey-auth') dependencies.clearPasskeyHint();
    return {
      kind: 'proof-error',
      error: proofError(error),
      passkeySeen: passkeySeen(dependencies),
    };
  }
}

export function createSsoValidationService(dependencies: SsoValidationDependencies) {
  return {
    validateInitial: (state: SsoBrowserState, returnCode: string) =>
      validateInitial(dependencies, state, returnCode),
    validateProof: (state: SsoBrowserState, returnCode: string, choice: SsoProofChoice) =>
      validateProof(dependencies, state, returnCode, choice),
  };
}

export const browserSsoValidation = createSsoValidationService({
  validate: submitSsoValidation,
  loadTrust: loadDeviceTrust,
  clearTrust: clearDeviceTrust,
  hasPasskeyHint,
  clearPasskeyHint,
  authenticatePasskey: authenticateExistingPasskey,
  createPasskey: createNewPasskey,
  rememberPasskey: rememberPasskeyCredential,
  googleProof: runGoogleProof,
});

export { isGoogleConfigured };
