import { createHash } from 'node:crypto';

export function hashSsoReturnCode(code: string): string {
  return createHash('sha256').update(`argus-pair-sso-return:${code}`).digest('hex');
}

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
