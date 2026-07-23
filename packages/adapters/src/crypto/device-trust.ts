import { createHmac, timingSafeEqual } from 'node:crypto';

const DEVICE_TRUST_TTL_SECONDS = 12 * 60 * 60;

export interface DeviceTrustPayload {
  v: 1;
  pubkey: string;
  keyId: string;
  ip: string;
  iat: number;
  exp: number;
}

export type DeviceTrustVerification =
  { ok: true; payload: DeviceTrustPayload; ipChanged: boolean } | { ok: false; reason: string };

function mac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function validMac(secret: string, body: string, received: string): boolean {
  const expectedBytes = Buffer.from(mac(secret, body));
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function decodePayload(body: string): DeviceTrustPayload | null {
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DeviceTrustPayload;
  } catch {
    return null;
  }
}

export function createDeviceTrustTokens(secret: string | null, nowEpochSeconds: () => number) {
  return {
    mint(publicKey: string, keyId: string, ip: string): string | null {
      if (!secret || !ip) return null;
      const iat = nowEpochSeconds();
      const payload: DeviceTrustPayload = {
        v: 1,
        pubkey: publicKey,
        keyId,
        ip,
        iat,
        exp: iat + DEVICE_TRUST_TTL_SECONDS,
      };
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${body}.${mac(secret, body)}`;
    },

    verify(token: string, requesterIp: string, expectedPublicKey: string): DeviceTrustVerification {
      const [body, receivedMac] = token.split('.', 2);
      if (!body || !receivedMac) return { ok: false, reason: 'malformed' };
      if (!secret) return { ok: false, reason: 'no_secret' };
      if (!validMac(secret, body, receivedMac)) return { ok: false, reason: 'hmac' };
      const payload = decodePayload(body);
      if (!payload) return { ok: false, reason: 'not_json' };
      if (payload.v !== 1) return { ok: false, reason: 'version' };
      if (nowEpochSeconds() > payload.exp) return { ok: false, reason: 'expired' };
      if (payload.pubkey !== expectedPublicKey) {
        return { ok: false, reason: 'pubkey_mismatch' };
      }
      return { ok: true, payload, ipChanged: Boolean(requesterIp) && payload.ip !== requesterIp };
    },
  };
}
