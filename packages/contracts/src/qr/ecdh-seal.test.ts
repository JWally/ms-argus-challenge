import { describe, expect, it } from 'vitest';
import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  openBytes,
  sealBytes,
} from './ecdh-seal.js';

describe('ephemeral QR seal', () => {
  it('shares a P-256 key without exposing either private key', async () => {
    const client = await generateKeyPair();
    const server = await generateKeyPair();
    const [clientKey, serverKey] = await Promise.all([
      deriveAesKey(
        client.privateKey,
        await importPublicKey(await exportPublicKey(server.publicKey))
      ),
      deriveAesKey(
        server.privateKey,
        await importPublicKey(await exportPublicKey(client.publicKey))
      ),
    ]);
    const sealed = await sealBytes(serverKey, new Uint8Array([1, 2, 3, 4]));
    await expect(openBytes(clientKey, sealed)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects a ciphertext opened by an unrelated key', async () => {
    const sender = await generateKeyPair();
    const receiver = await generateKeyPair();
    const stranger = await generateKeyPair();
    const sendKey = await deriveAesKey(
      sender.privateKey,
      await importPublicKey(await exportPublicKey(receiver.publicKey))
    );
    const wrongKey = await deriveAesKey(
      stranger.privateKey,
      await importPublicKey(await exportPublicKey(sender.publicKey))
    );
    await expect(
      openBytes(wrongKey, await sealBytes(sendKey, new Uint8Array([1])))
    ).rejects.toThrow();
  });
});
