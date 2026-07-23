import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export function createCachedSecretProvider(
  client: SecretsManagerClient,
  secretId: string | undefined
) {
  let cached: string | null | undefined;
  return {
    async get(): Promise<string | null> {
      if (cached !== undefined) return cached;
      if (!secretId) {
        cached = null;
        return cached;
      }
      const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
      if (!result.SecretString) throw new Error('secret_empty');
      cached = result.SecretString;
      return cached;
    },
  };
}
