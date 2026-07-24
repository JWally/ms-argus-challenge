import { createHash, timingSafeEqual } from 'node:crypto';

export function hashSsoReturnCode(code: string): string {
  return createHash('sha256').update(`argus-pair-sso-return:${code}`).digest('hex');
}

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenHashesEqual(expectedHash: string, actualHash: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  return expected.length === 32 && actual.length === 32 && timingSafeEqual(expected, actual);
}
