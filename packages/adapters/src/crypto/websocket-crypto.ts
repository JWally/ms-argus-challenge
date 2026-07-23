import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type {
  BootstrapClaims,
  ConnectionEnvelope,
  ParticipantConnectionRole,
} from '@argus-challenge/core';

const BOOTSTRAP_TOKEN_TTL_SECONDS = 300;
const ALLOWED_ROLES = new Set<ParticipantConnectionRole>(['desktop', 'phone']);

function deriveKey(rootSecret: Buffer, purpose: string, salt = Buffer.alloc(0)): Buffer {
  return Buffer.from(hkdfSync('sha256', rootSecret, salt, Buffer.from(purpose, 'utf8'), 32));
}

function hasValidMac(key: Buffer, body: string, received: string): boolean {
  const expected = Buffer.from(createHmac('sha256', key).update(body).digest('base64url'));
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parseBootstrapClaims(body: string): BootstrapClaims | null {
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as BootstrapClaims;
  } catch {
    return null;
  }
}

function decryptEnvelope(key: Buffer, blob: string): ConnectionEnvelope | null {
  try {
    const wire = Buffer.from(blob, 'base64url');
    if (wire.length < 28) return null;
    const iv = wire.subarray(0, 12);
    const tag = wire.subarray(wire.length - 16);
    const ciphertext = wire.subarray(12, wire.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const envelope = JSON.parse(plaintext.toString('utf8')) as ConnectionEnvelope;
    return envelope.v === 1 ? envelope : null;
  } catch {
    return null;
  }
}

export function createWebSocketCrypto(rootSecret: Buffer, nowEpochSeconds: () => number) {
  const hmacKey = deriveKey(rootSecret, 'ws-bootstrap-hmac-v1');
  const envelopeKey = deriveKey(rootSecret, 'ws-envelope-aes-v1');

  return {
    async mintBootstrapToken(sessionId: string, role: ParticipantConnectionRole): Promise<string> {
      const iat = nowEpochSeconds();
      const claims: BootstrapClaims = {
        v: 1,
        sessionId,
        role,
        iat,
        exp: iat + BOOTSTRAP_TOKEN_TTL_SECONDS,
      };
      const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const mac = createHmac('sha256', hmacKey).update(body).digest('base64url');
      return `${body}.${mac}`;
    },

    async verifyBootstrapToken(token: string): Promise<BootstrapClaims | null> {
      const [body, mac] = token.split('.', 2);
      if (!body || !mac || !hasValidMac(hmacKey, body, mac)) return null;
      const claims = parseBootstrapClaims(body);
      if (!claims || claims.v !== 1 || !ALLOWED_ROLES.has(claims.role)) return null;
      return nowEpochSeconds() > claims.exp ? null : claims;
    },

    async sealEnvelope(envelope: ConnectionEnvelope): Promise<string> {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', envelopeKey, iv);
      const plaintext = Buffer.from(JSON.stringify(envelope));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64url');
    },

    async openEnvelope(blob: string): Promise<ConnectionEnvelope | null> {
      return decryptEnvelope(envelopeKey, blob);
    },

    async getVerdictRevealKey(sessionId: string): Promise<string> {
      return deriveKey(
        rootSecret,
        'pair-verdict-reveal-v1',
        Buffer.from(sessionId, 'utf8')
      ).toString('base64url');
    },
  };
}
