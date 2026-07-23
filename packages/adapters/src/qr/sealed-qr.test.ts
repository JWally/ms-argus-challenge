import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  openBytes,
  unpackQrFrameBundle,
} from '@argus-challenge/contracts';
import { describe, expect, it } from 'vitest';
import { sealPairTokenQr, type PairTokenQrProfile } from './sealed-qr.js';

describe('sealed pair-token QR', () => {
  it('delivers only encrypted PNG frames to the page response', async () => {
    const client = await generateKeyPair();
    const profiles: PairTokenQrProfile[] = [];
    const sealed = await sealPairTokenQr(
      {
        pairOrigin: 'https://challenge.example',
        token: 'one-time-token',
        suffix: '',
        clientPublicKey: await exportPublicKey(client.publicKey),
        compression: 'none',
      },
      { recordProfile: (profile) => profiles.push(profile) }
    );
    expect(sealed).toMatchObject({
      kind: 'png-frames',
      compression: 'none',
      frameCount: 4,
    });
    expect(JSON.stringify(sealed)).not.toContain('one-time-token');
    const key = await deriveAesKey(client.privateKey, await importPublicKey(sealed.sPub));
    const bundle = unpackQrFrameBundle(await openBytes(key, sealed.enc));
    expect(bundle.frames).toHaveLength(4);
    expect(bundle.frames[0]?.slice(1, 4)).toEqual(new Uint8Array([80, 78, 71]));
    expect(profiles).toEqual([
      expect.objectContaining({
        event: 'pair_token_qr_profile',
        frameCount: 4,
        totalMs: expect.any(Number),
        renderMs: expect.any(Number),
        sealMs: expect.any(Number),
        renderProfile: expect.objectContaining({
          frames: expect.arrayContaining([
            expect.objectContaining({ encodeMs: expect.any(Number) }),
          ]),
        }),
      }),
    ]);
  });
});
