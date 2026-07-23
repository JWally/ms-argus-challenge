import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoPasskeyStore } from './dynamo-passkey-store.js';

const passkey = {
  credentialId: 'credential-1',
  publicKey: 'encoded-key',
  signCount: 3,
  argusPublicKey: 'argus-key',
  createdAt: 1_000,
  lastUsedAt: 1_001,
};

describe('Dynamo passkey store', () => {
  it('saves and loads the domain record without storage keys', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: { PK: 'PASSKEY#credential-1', SK: 'CREDENTIAL', ...passkey },
      });
    const store = createDynamoPasskeyStore(
      { send } as unknown as DynamoDBDocumentClient,
      'challenge-table'
    );
    await store.save(passkey);
    await expect(store.load('credential-1')).resolves.toEqual(passkey);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Item: { PK: 'PASSKEY#credential-1', SK: 'CREDENTIAL', ...passkey },
    });
  });
});
