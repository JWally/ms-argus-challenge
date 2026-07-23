import type { ApplicationResponse } from '../http/application-response.js';
import type { ChallengeSession } from '../sessions/session.js';
import type { StoredDesktopAttestation } from './desktop-attestation.js';

interface DesktopSummary {
  clean: boolean;
  summary: Record<string, unknown> | null;
}

interface DesktopAttestationRouteDependencies {
  loadSession(sessionId: string): Promise<ChallengeSession | null>;
  prepare(
    body: Record<string, unknown>,
    session: ChallengeSession
  ): Promise<
    | { ok: true; stored: StoredDesktopAttestation }
    | { ok: false; status: number; body: Record<string, unknown> }
  >;
  store(sessionId: string, attestation: StoredDesktopAttestation): Promise<boolean>;
  classifyDesktop(argusSessionId: string): Promise<DesktopSummary | null>;
  warn(message: string): void;
}

type Response = ApplicationResponse<Record<string, unknown>>;

async function classifyAfterCommit(
  argusSessionId: string,
  dependencies: DesktopAttestationRouteDependencies
): Promise<DesktopSummary | null> {
  try {
    return await dependencies.classifyDesktop(argusSessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.warn(`[challenge] desktop-attest optimistic classify failed: ${message}`);
    return null;
  }
}

export function createDesktopAttestationHandler(dependencies: DesktopAttestationRouteDependencies) {
  return async (body: Record<string, unknown>, sessionId: string): Promise<Response> => {
    const session = await dependencies.loadSession(sessionId);
    if (!session) return { status: 404, body: { error: 'session_not_found' } };
    if (session.desktopAttestation) {
      return { status: 409, body: { error: 'already_attested' } };
    }
    const prepared = await dependencies.prepare(body, session);
    if (!prepared.ok) return { status: prepared.status, body: prepared.body };
    if (!(await dependencies.store(sessionId, prepared.stored))) {
      return { status: 409, body: { error: 'already_attested' } };
    }
    const classification = await classifyAfterCommit(prepared.stored.argusSessionId, dependencies);
    return {
      status: 200,
      body: {
        ok: true,
        clean: classification?.clean ?? false,
        summary: classification?.summary ?? null,
      },
    };
  };
}
