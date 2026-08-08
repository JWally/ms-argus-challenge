import { describe, expect, it, vi } from 'vitest';
import { createDrawingPicturesHandler } from './drawing-pictures-route.js';

const SESSION_ID = '4f4cf495-a98b-4b76-9099-8ad59dc85ccb';
const SESSION = {
  id: SESSION_ID,
  nonce: 'client-visible-nonce',
  drawingPromptSeed: 'server-only-drawing-seed',
  expiresAt: 1_900_000_300,
  challengeId: 'checkout_action_123456789',
  cpi: null,
  proofRequired: false,
  freshProofRequired: false,
  hostPreflightRequired: false,
  verdict: 'pending' as const,
};

function handler(overrides: Partial<Parameters<typeof createDrawingPicturesHandler>[0]> = {}) {
  return createDrawingPicturesHandler({
    authenticatePhone: vi.fn().mockResolvedValue(true),
    loadSession: vi.fn().mockResolvedValue(SESSION),
    sealPictures: vi.fn().mockResolvedValue({
      enc: 'sealed-png-frames',
      sPub: 'server-public-key',
      kind: 'drawing-pictures',
      encoding: 'png',
      compression: 'none',
      width: 400,
      height: 180,
      framesPerPrompt: 2,
      frameMs: 40,
      pictureCount: 6,
    }),
    ...overrides,
  });
}

describe('drawing pictures route', () => {
  it('authenticates the phone token and returns grader targets with the sealed pictures', async () => {
    const authenticatePhone = vi.fn().mockResolvedValue(true);
    const sealPictures = vi.fn().mockResolvedValue({
      enc: 'sealed-png-frames',
      sPub: 'server-public-key',
      kind: 'drawing-pictures',
      encoding: 'png',
      compression: 'none',
      width: 400,
      height: 180,
      framesPerPrompt: 2,
      frameMs: 40,
      pictureCount: 6,
    });
    const response = await handler({ authenticatePhone, sealPictures })(
      {
        routeKey: 'POST /api/session/{id}/drawing-pictures',
        headers: { authorization: 'Bearer phone-token' },
      },
      SESSION_ID,
      { clientPublicKey: 'client-public-key' }
    );

    expect(authenticatePhone).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { authorization: 'Bearer phone-token' } }),
      SESSION_ID
    );
    expect(sealPictures).toHaveBeenCalledWith({
      clientPublicKey: 'client-public-key',
      compression: 'none',
      prompts: expect.arrayContaining([
        expect.objectContaining({ letter: expect.stringMatching(/^[A-HJ-NP-Z]$/) }),
      ]),
    });
    expect(JSON.stringify(response.body)).not.toContain('server-only-drawing-seed');
    expect(JSON.stringify(response.body)).not.toContain('client-visible-nonce');
    expect(response).toMatchObject({
      status: 200,
      body: {
        kind: 'drawing-pictures',
        pictureCount: 6,
        letters: [
          expect.stringMatching(/^[A-HJ-NP-Z]$/),
          expect.stringMatching(/^[A-HJ-NP-Z]$/),
          expect.stringMatching(/^[A-HJ-NP-Z]$/),
        ],
      },
    });
  });

  it('fails closed before rendering when the caller is not the phone participant', async () => {
    const sealPictures = vi.fn();
    await expect(
      handler({ authenticatePhone: vi.fn().mockResolvedValue(false), sealPictures })(
        { routeKey: 'POST /api/session/{id}/drawing-pictures' },
        SESSION_ID,
        { clientPublicKey: 'client-public-key' }
      )
    ).resolves.toEqual({ status: 401, body: { error: 'phone_token_required' } });
    expect(sealPictures).not.toHaveBeenCalled();
  });

  it('rejects missing key material and sessions without a server drawing seed', async () => {
    await expect(
      handler()({ routeKey: 'POST /api/session/{id}/drawing-pictures' }, SESSION_ID, {})
    ).resolves.toEqual({ status: 400, body: { error: 'missing_client_public_key' } });

    await expect(
      handler({
        loadSession: vi.fn().mockResolvedValue({ ...SESSION, drawingPromptSeed: undefined }),
      })({ routeKey: 'POST /api/session/{id}/drawing-pictures' }, SESSION_ID, {
        clientPublicKey: 'client-public-key',
      })
    ).resolves.toEqual({ status: 410, body: { error: 'drawing_pictures_unavailable' } });
  });
});
