import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { describe, expect, it, vi } from 'vitest';
import { createCachedSecretProvider } from './cached-secret.js';

describe('cached secret provider', () => {
  it('loads one non-empty secret per warm runtime', async () => {
    const send = vi.fn().mockResolvedValue({ SecretString: 'secret-value' });
    const provider = createCachedSecretProvider(
      { send } as unknown as SecretsManagerClient,
      'secret-arn'
    );
    await expect(provider.get()).resolves.toBe('secret-value');
    await expect(provider.get()).resolves.toBe('secret-value');
    expect(send).toHaveBeenCalledOnce();
  });

  it('returns null when unconfigured and rejects empty configured secrets', async () => {
    await expect(
      createCachedSecretProvider({} as SecretsManagerClient, undefined).get()
    ).resolves.toBeNull();
    const provider = createCachedSecretProvider(
      { send: vi.fn().mockResolvedValue({}) } as unknown as SecretsManagerClient,
      'secret-arn'
    );
    await expect(provider.get()).rejects.toThrow('secret_empty');
  });
});
