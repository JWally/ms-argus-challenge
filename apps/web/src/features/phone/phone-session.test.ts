import { describe, expect, it, vi } from 'vitest';
import type { RelayConnection } from '../../shared/websocket.js';
import {
  openServerDrawingPictures,
  readDesktopReady,
  startPhoneSessionWithDependencies,
} from './phone-session.js';

describe('desktop-ready binding', () => {
  const message = {
    action: 'message' as const,
    from: 'desktop' as const,
    fromEnvelope: 'desktop-envelope',
    sessionId: 'session-id',
    data: {
      kind: 'desktop-ready',
      nonce: 'nonce-value-123456',
      expiresAt: 2_000_000_000,
      desktopArgusSessionId: 'argus-desktop',
      desktopKeyId: 'desktop-key',
    },
  };

  it('accepts a ready message bound to this session, envelope, and nonce', () => {
    expect(
      readDesktopReady(message, {
        sessionId: 'session-id',
        desktopEnvelope: 'desktop-envelope',
        nonce: 'nonce-value-123456',
      })
    ).toMatchObject({ desktopKeyId: 'desktop-key' });
  });

  it('rejects a replay from a different desktop envelope', () => {
    expect(
      readDesktopReady(message, {
        sessionId: 'session-id',
        desktopEnvelope: 'attacker-envelope',
        nonce: 'nonce-value-123456',
      })
    ).toBeNull();
  });
});

describe('server drawing picture opener', () => {
  it('posts only the phone token and ephemeral public key, then opens sealed pixels in the worker', async () => {
    const keyholder = {
      key: async () => ({ clientPublicKey: 'client-public-key' }),
      openDrawingPictures: async (sealed: unknown) => ({
        encoding: 'gray8' as const,
        width: 2,
        height: 2,
        framesPerPrompt: 2,
        frameMs: 50,
        pictures: [new Uint8Array([1, 2, 3, 4])],
        sealed,
      }),
      close: () => undefined,
    };
    const requests: unknown[] = [];
    const request = async <T>(input: string, init: RequestInit = {}): Promise<T> => {
      requests.push({ input, init });
      return {
        enc: 'sealed-pixels',
        sPub: 'server-public-key',
        kind: 'drawing-pictures',
        encoding: 'gray8',
        compression: 'none',
        width: 2,
        height: 2,
        framesPerPrompt: 2,
        frameMs: 50,
        pictureCount: 1,
      } as T;
    };

    await expect(
      openServerDrawingPictures(
        '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
        {
          wsUrl: 'wss://socket.example/dev',
          desktopEnvelope: 'desktop-envelope',
          phoneToken: 'phone-token',
          nonce: 'client-visible-nonce',
          proofRequired: true,
          freshProofRequired: false,
        },
        { keyholder, request }
      )
    ).resolves.toMatchObject({ width: 2, pictures: [expect.any(Uint8Array)] });

    expect(requests).toEqual([
      {
        input: '/api/session/4f4cf495-a98b-4b76-9099-8ad59dc85ccb/drawing-pictures',
        init: {
          method: 'POST',
          headers: { authorization: 'Bearer phone-token' },
          body: JSON.stringify({ clientPublicKey: 'client-public-key' }),
        },
      },
    ]);
  });

  it('keeps the worker alive until sealed pixels finish opening', async () => {
    type Pictures = {
      encoding: 'gray8';
      width: number;
      height: number;
      framesPerPrompt: number;
      frameMs: number;
      pictures: Uint8Array[];
    };
    let finishOpening: (pictures: Pictures) => void = () => {
      throw new Error('opening_not_started');
    };
    let openingStarted: (() => void) | null = null;
    const opening = new Promise<void>((resolve) => {
      openingStarted = resolve;
    });
    const keyholder = {
      key: async () => ({ clientPublicKey: 'client-public-key' }),
      openDrawingPictures: (sealed: unknown) => {
        expect(sealed).toMatchObject({ enc: 'sealed-pixels' });
        openingStarted?.();
        return new Promise<Pictures>((resolve) => {
          finishOpening = resolve;
        });
      },
      close: vi.fn(),
    };
    const request = async <T>(): Promise<T> =>
      ({
        enc: 'sealed-pixels',
        sPub: 'server-public-key',
        kind: 'drawing-pictures',
        encoding: 'gray8',
        compression: 'none',
        width: 2,
        height: 2,
        framesPerPrompt: 2,
        frameMs: 50,
        pictureCount: 1,
      }) as T;

    const result = openServerDrawingPictures(
      '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
      {
        wsUrl: 'wss://socket.example/dev',
        desktopEnvelope: 'desktop-envelope',
        phoneToken: 'phone-token',
        nonce: 'client-visible-nonce',
        proofRequired: true,
        freshProofRequired: false,
      },
      { keyholder, request }
    );

    await opening;
    expect(keyholder.close).not.toHaveBeenCalled();
    finishOpening({
      encoding: 'gray8',
      width: 2,
      height: 2,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures: [new Uint8Array([1, 2, 3, 4])],
    });

    await expect(result).resolves.toMatchObject({ width: 2, height: 2 });
    expect(keyholder.close).toHaveBeenCalledOnce();
  });
});

describe('phone session startup', () => {
  it('shows the drawing challenge after secure pictures open without waiting for desktop-ready', async () => {
    const pictures = {
      encoding: 'gray8' as const,
      width: 2,
      height: 2,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures: [new Uint8Array([1, 2, 3, 4])],
    };
    const connection: RelayConnection = {
      envelope: 'phone-envelope',
      sessionId: '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
      role: 'phone',
      send: vi.fn(),
      subscribe: vi.fn(),
      disconnected: vi.fn(),
      waitFor: vi.fn<RelayConnection['waitFor']>(() => new Promise<never>(() => undefined)),
      close: vi.fn(),
    };
    let scanStarted = false;
    const hash = `#${new URLSearchParams({
      wsUrl: 'wss://socket.example/dev',
      e: 'desktop-envelope',
      pt: 'phone-token',
      n: 'client-visible-nonce',
    }).toString()}`;

    const session = await startPhoneSessionWithDependencies(
      '4f4cf495-a98b-4b76-9099-8ad59dc85ccb',
      {
        hash,
        openPictures: async () => pictures,
        scan: async () => {
          scanStarted = true;
          return new Promise(() => undefined);
        },
        connect: async () => connection,
        nowMs: () => 1_700_000_000_000,
      }
    );

    expect(session.pictures).toBe(pictures);
    expect(scanStarted).toBe(true);
    expect(connection.send).toHaveBeenCalledWith('desktop-envelope', {
      kind: 'phone-here',
      challenge: true,
    });
    await expect(
      Promise.race([
        session.ready.then(
          () => 'ready',
          () => 'rejected'
        ),
        Promise.resolve('pending'),
      ])
    ).resolves.toBe('pending');
  });
});
