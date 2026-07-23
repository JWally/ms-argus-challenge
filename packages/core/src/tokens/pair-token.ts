import { randomBytes } from 'node:crypto';

export const PAIR_TOKEN_TTL_SECONDS = 300;

export interface PairBlob {
  sessionId: string;
  wsUrl: string;
  e: string;
  pt: string;
  n: string;
  proofRequired: boolean;
  freshProofRequired: boolean;
}

export interface SingleUseTokenStore {
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
  take(key: string): Promise<string | null>;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

function storageKey(token: string): string {
  return `ptoken:${token}`;
}

function parsePairBlob(value: string): PairBlob | null {
  try {
    const blob = JSON.parse(value) as Partial<PairBlob>;
    return typeof blob.sessionId === 'string' &&
      typeof blob.wsUrl === 'string' &&
      typeof blob.e === 'string' &&
      typeof blob.pt === 'string' &&
      typeof blob.n === 'string' &&
      typeof blob.proofRequired === 'boolean' &&
      typeof blob.freshProofRequired === 'boolean'
      ? (blob as PairBlob)
      : null;
  } catch {
    return null;
  }
}

export async function mintPairToken(store: SingleUseTokenStore, blob: PairBlob): Promise<string> {
  const token = randomBytes(16).toString('base64url');
  await store.put(storageKey(token), JSON.stringify(blob), PAIR_TOKEN_TTL_SECONDS);
  return token;
}

export async function redeemPairToken(
  store: SingleUseTokenStore,
  token: string
): Promise<PairBlob | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const stored = await store.take(storageKey(token));
  return stored ? parsePairBlob(stored) : null;
}
