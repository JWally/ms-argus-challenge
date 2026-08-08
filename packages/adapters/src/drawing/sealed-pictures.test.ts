import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  openBytes,
  unpackDrawingPictureBundle,
} from '@argus-challenge/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  DRAWING_PICTURE_ALPHABET,
  buildDrawingPictureCatalog,
  renderServerDrawingPictures,
  sealDrawingPictures,
  type DrawingPictureProfile,
} from './sealed-pictures.js';

describe('sealed drawing pictures', () => {
  it('uses retina-friendlier default picture dimensions for phone display', async () => {
    const renderMask = vi.fn(({ width, height }: { width: number; height: number }) =>
      Promise.resolve(new Uint8Array(width * height).fill(255))
    );
    const render = renderServerDrawingPictures({
      encoding: 'gray8',
      variantCount: 1,
      renderMask,
    });

    await expect(render([{ letter: 'P', seed: 'default-size' }])).resolves.toMatchObject({
      encoding: 'gray8',
      width: 600,
      height: 270,
      framesPerPrompt: 4,
      frameMs: 30,
      pictures: expect.arrayContaining([expect.any(Uint8Array)]),
      profile: expect.objectContaining({
        pictureCount: 4,
        totalBytes: 4 * 600 * 270,
      }),
    });
  });

  it('renders server-side png pictures without exposing prompt letters in the response', async () => {
    const client = await generateKeyPair();
    const profiles: DrawingPictureProfile[] = [];
    const sealed = await sealDrawingPictures(
      {
        clientPublicKey: await exportPublicKey(client.publicKey),
        compression: 'none',
        width: 80,
        height: 36,
        prompts: [
          { letter: 'A', seed: 'session-one:0' },
          { letter: 'R', seed: 'session-one:1' },
          { letter: 'G', seed: 'session-one:2' },
        ],
      },
      { recordProfile: (profile) => profiles.push(profile) }
    );

    expect(sealed).toMatchObject({
      kind: 'drawing-pictures',
      encoding: 'png',
      compression: 'none',
      framesPerPrompt: 4,
      frameMs: 30,
      pictureCount: 12,
    });
    expect(JSON.stringify(sealed)).not.toContain('session-one');
    expect(sealed).not.toHaveProperty('prompts');
    expect(sealed).not.toHaveProperty('letters');

    const key = await deriveAesKey(client.privateKey, await importPublicKey(sealed.sPub));
    const bundle = unpackDrawingPictureBundle(await openBytes(key, sealed.enc));
    expect(bundle).toMatchObject({
      encoding: 'png',
      width: sealed.width,
      height: sealed.height,
      framesPerPrompt: sealed.framesPerPrompt,
      frameMs: sealed.frameMs,
      pictures: expect.arrayContaining([expect.any(Uint8Array)]),
    });
    expect(bundle.pictures).toHaveLength(12);
    expect(Array.from(bundle.pictures[0]!.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(
      new Set(bundle.pictures.map((picture) => Buffer.from(picture).toString('base64'))).size
    ).toBeGreaterThan(1);
    expect(profiles).toEqual([
      expect.objectContaining({
        event: 'drawing_picture_profile',
        pictureCount: 12,
        totalMs: expect.any(Number),
        renderMs: expect.any(Number),
        sealMs: expect.any(Number),
      }),
    ]);
  });

  it('keeps rendered pixels cacheable outside the route handler budget', async () => {
    const renderMask = vi.fn(({ width, height }: { width: number; height: number }) =>
      Promise.resolve(new Uint8Array(width * height).fill(255))
    );
    const render = renderServerDrawingPictures({
      encoding: 'gray8',
      width: 12,
      height: 9,
      variantCount: 1,
      framesPerPrompt: 2,
      renderMask,
    });

    await expect(
      render([
        { letter: 'B', seed: 'repeatable' },
        { letter: 'B', seed: 'repeatable' },
        { letter: 'C', seed: 'other' },
      ])
    ).resolves.toEqual({
      encoding: 'gray8',
      width: 12,
      height: 9,
      framesPerPrompt: 2,
      frameMs: 30,
      pictures: expect.arrayContaining([expect.any(Uint8Array)]),
      profile: expect.objectContaining({
        encoding: 'gray8',
        cacheHits: 2,
        cacheMisses: 4,
        totalBytes: 6 * 12 * 9,
      }),
    });
    expect(renderMask).toHaveBeenCalledTimes(2);
  });

  it('can prebuild a bounded variant catalog for route-time reuse', async () => {
    const renderMask = vi.fn(
      ({ letter, width, height }: { letter: string; width: number; height: number }) =>
        Promise.resolve(new Uint8Array(width * height).fill(letter.codePointAt(0) ?? 0))
    );
    const catalog = await buildDrawingPictureCatalog({
      encoding: 'gray8',
      width: 12,
      height: 9,
      variantCount: 1,
      framesPerPrompt: 2,
      renderMask,
    });
    expect(renderMask).toHaveBeenCalledTimes(DRAWING_PICTURE_ALPHABET.length);
    expect(catalog.pictures.size).toBe(DRAWING_PICTURE_ALPHABET.length * 2);

    renderMask.mockClear();
    const render = renderServerDrawingPictures({
      catalog,
      renderMask,
    });
    const result = await render([
      { letter: 'B', seed: 'first-request' },
      { letter: 'B', seed: 'another-request' },
    ]);

    expect(renderMask).not.toHaveBeenCalled();
    expect(result).toMatchObject({ encoding: 'gray8', framesPerPrompt: 2, frameMs: 30 });
    expect(result.profile).toMatchObject({ cacheHits: 4, cacheMisses: 0 });
    expect(result.pictures[0]).toEqual(result.pictures[2]);
  });

  it('rejects prompt text outside the server-owned drawing alphabet', async () => {
    const client = await generateKeyPair();
    await expect(
      sealDrawingPictures({
        clientPublicKey: await exportPublicKey(client.publicKey),
        compression: 'none',
        prompts: [{ letter: 'I', seed: 'ambiguous-letter' }],
      })
    ).rejects.toThrow('invalid_drawing_picture_letter');
  });
});
