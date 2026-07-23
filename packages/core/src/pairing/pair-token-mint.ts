import type { ApplicationResponse } from '../http/application-response.js';
import type { PairBlob } from '../tokens/pair-token.js';

interface PairTokenMintBody {
  wsUrl: string;
  e: string;
  pt: string;
  n: string;
  cPub: string;
  workerUrl: string;
  workerSha256: string;
  debug: boolean;
}

type WorkerIntegrityResult =
  | { ok: true }
  | {
      ok: false;
      status: 400;
      error: 'worker_integrity_invalid';
      reason: string;
    };

export interface PairTokenMintDependencies {
  authenticateParticipant(event: unknown, sessionId: string): Promise<boolean>;
  loadSession(
    sessionId: string
  ): Promise<{ proofRequired?: boolean; freshProofRequired?: boolean } | null>;
  verifyWorkerIntegrity(input: {
    workerUrl: string;
    workerSha256: string;
  }): Promise<WorkerIntegrityResult>;
  mintToken(blob: PairBlob): Promise<string>;
  sealQr(input: {
    pairOrigin: string;
    token: string;
    suffix: string;
    clientPublicKey: string;
    compression: 'none';
  }): Promise<Record<string, unknown>>;
  pairOrigin: string;
  proofRequiredByDefault: boolean;
  warn(message: string): void;
}

type Response = ApplicationResponse<Record<string, unknown>>;

function parseBody(body: Record<string, unknown>): PairTokenMintBody | null {
  const required = [
    body.wsUrl,
    body.e,
    body.pt,
    body.n,
    body.cPub,
    body.workerUrl,
    body.workerSha256,
  ];
  if (!required.every((value) => typeof value === 'string')) return null;
  return {
    wsUrl: body.wsUrl as string,
    e: body.e as string,
    pt: body.pt as string,
    n: body.n as string,
    cPub: body.cPub as string,
    workerUrl: body.workerUrl as string,
    workerSha256: body.workerSha256 as string,
    debug: body.debug === true,
  };
}

export function createPairTokenMintHandler(dependencies: PairTokenMintDependencies) {
  return async (
    event: unknown,
    sessionId: string,
    body: Record<string, unknown>
  ): Promise<Response> => {
    if (!(await dependencies.authenticateParticipant(event, sessionId))) {
      return { status: 401, body: { error: 'pair_token_unauthorized' } };
    }
    const parsed = parseBody(body);
    if (!parsed) return { status: 400, body: { error: 'invalid_pair_blob' } };
    const session = await dependencies.loadSession(sessionId);
    if (!session) return { status: 404, body: { error: 'session_not_found' } };
    const integrity = await dependencies.verifyWorkerIntegrity(parsed);
    if (!integrity.ok) {
      return {
        status: integrity.status,
        body: { error: integrity.error, reason: integrity.reason },
      };
    }
    const token = await dependencies.mintToken({
      sessionId,
      wsUrl: parsed.wsUrl,
      e: parsed.e,
      pt: parsed.pt,
      n: parsed.n,
      proofRequired: session.proofRequired ?? dependencies.proofRequiredByDefault,
      freshProofRequired: session.freshProofRequired ?? false,
    });
    try {
      return {
        status: 200,
        body: await dependencies.sealQr({
          pairOrigin: dependencies.pairOrigin,
          token,
          suffix: parsed.debug ? '?debug=true' : '',
          clientPublicKey: parsed.cPub,
          compression: 'none',
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dependencies.warn(`[challenge] pair-token seal failed: ${message}`);
      return { status: 400, body: { error: 'bad_client_pubkey' } };
    }
  };
}
