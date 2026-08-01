import type { ChallengeApiEvent } from '../http/challenge-api-router.js';
import type { ApplicationResponse } from '../http/application-response.js';
import type { ChallengeSession } from '../sessions/session.js';
import { drawingPromptsForSession, type ServerDrawingPrompt } from './drawing-prompts.js';

type Body = Record<string, unknown>;
type ApiResponse = ApplicationResponse<Record<string, unknown>>;

interface SealDrawingPicturesInput {
  clientPublicKey: string;
  compression: 'none';
  prompts: ServerDrawingPrompt[];
}

export interface DrawingPicturesHandlerDependencies {
  authenticatePhone(event: ChallengeApiEvent, sessionId: string): Promise<boolean>;
  loadSession(sessionId: string): Promise<ChallengeSession | null>;
  sealPictures(input: SealDrawingPicturesInput): Promise<Record<string, unknown>>;
}

function clientPublicKey(body: Body): string | null {
  return typeof body.clientPublicKey === 'string' && body.clientPublicKey.length > 0
    ? body.clientPublicKey
    : null;
}

function canRequestDrawingPictures(
  session: ChallengeSession | null
): session is ChallengeSession & {
  drawingPromptSeed: string;
} {
  return (
    Boolean(session) &&
    session?.verdict === 'pending' &&
    typeof session.drawingPromptSeed === 'string' &&
    session.drawingPromptSeed.length > 0
  );
}

export function createDrawingPicturesHandler(dependencies: DrawingPicturesHandlerDependencies) {
  return async (event: ChallengeApiEvent, sessionId: string, body: Body): Promise<ApiResponse> => {
    const publicKey = clientPublicKey(body);
    if (!publicKey) return { status: 400, body: { error: 'missing_client_public_key' } };
    if (!(await dependencies.authenticatePhone(event, sessionId))) {
      return { status: 401, body: { error: 'phone_token_required' } };
    }
    const session = await dependencies.loadSession(sessionId);
    if (!canRequestDrawingPictures(session)) {
      return { status: 410, body: { error: 'drawing_pictures_unavailable' } };
    }
    const sealed = await dependencies.sealPictures({
      clientPublicKey: publicKey,
      compression: 'none',
      prompts: drawingPromptsForSession({
        sessionId,
        drawingPromptSeed: session.drawingPromptSeed,
      }),
    });
    return { status: 200, body: sealed };
  };
}
