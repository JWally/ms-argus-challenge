import { describe, expect, it } from 'vitest';
import { hashApprovalToken, hashSsoReturnCode, tokenHashesEqual } from './token-hash.js';

describe('SSO token hashes', () => {
  it('compares complete SHA-256 digests', () => {
    const approval = hashApprovalToken('approval-token');
    expect(tokenHashesEqual(approval, hashApprovalToken('approval-token'))).toBe(true);
    expect(tokenHashesEqual(approval, hashApprovalToken('different-token'))).toBe(false);
  });

  it.each(['', 'not-hex', 'aa'])('rejects malformed digest %s', (candidate) => {
    expect(tokenHashesEqual(hashSsoReturnCode('return-code'), candidate)).toBe(false);
  });
});
