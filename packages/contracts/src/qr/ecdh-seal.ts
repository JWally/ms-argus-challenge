interface EcdhKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
}

export async function generateKeyPair(): Promise<EcdhKeyPair> {
  return crypto.subtle.generateKey(ECDH, false, ['deriveKey']);
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey)));
}

export function importPublicKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64UrlToBytes(value), ECDH, false, []);
}

export function deriveAesKey(privateKey: CryptoKey, peerPublicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sealBytes(key: CryptoKey, bytes: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Uint8Array.from(bytes))
  );
  const sealed = new Uint8Array(iv.length + ciphertext.length);
  sealed.set(iv);
  sealed.set(ciphertext, iv.length);
  return bytesToBase64Url(sealed);
}

export async function openBytes(key: CryptoKey, value: string): Promise<Uint8Array> {
  const sealed = base64UrlToBytes(value);
  if (sealed.byteLength < 29) throw new Error('invalid_sealed_bytes');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.slice(0, 12) },
    key,
    sealed.slice(12)
  );
  return new Uint8Array(plaintext);
}
