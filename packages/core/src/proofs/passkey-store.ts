export interface StoredPasskey {
  credentialId: string;
  publicKey: string;
  signCount: number;
  argusPublicKey: string | null;
  createdAt: number;
  lastUsedAt: number;
}

export interface PasskeyStore {
  load(credentialId: string): Promise<StoredPasskey | null>;
  save(passkey: StoredPasskey): Promise<void>;
}
