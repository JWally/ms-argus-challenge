import { hashApprovalToken, type SsoSession } from '@argus-challenge/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { createDynamoSsoRepository } from './dynamo-sso-repository.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const session: SsoSession = {
  id: SESSION_ID,
  nonce: 'nonce-1',
  merchantSessionId: 'merchant-session',
  cpi: 'argus_cpi_test_Example12345.stepup',
  proofRequired: true,
  freshProofRequired: false,
  startProfile: {
    argusSessionId: 'scan-1',
    keyId: 'key-1',
    ip: '203.0.113.8',
    asnName: 'Carrier',
    country: 'US',
    city: 'Dallas',
    score: 0,
    isPhone: true,
    isProxy: false,
    isDatacenter: false,
    isVpn: false,
  },
  verdict: 'pending',
  expiresAt: 1_900_000_300,
};

function repository(send: ReturnType<typeof vi.fn>) {
  return createDynamoSsoRepository(
    { send } as unknown as DynamoDBDocumentClient,
    'challenge-table',
    () => 1_900_000_000
  );
}

describe('Dynamo SSO repository', () => {
  it('creates and consistently loads a live domain session', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { PK: `SSO#${SESSION_ID}`, SK: 'META', ...session } });
    const repo = repository(send);
    await expect(repo.createSession(session)).resolves.toBe(true);
    await expect(repo.loadSession(SESSION_ID)).resolves.toEqual(session);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Item: { PK: `SSO#${SESSION_ID}`, SK: 'META', ...session },
      ConditionExpression: 'attribute_not_exists(PK)',
    });
    expect(send.mock.calls[1]?.[0].input.ConsistentRead).toBe(true);
  });

  it('records challenge and validation with separate conditional writes', async () => {
    const send = vi.fn().mockResolvedValue({});
    const repo = repository(send);
    await expect(
      repo.recordChallenge({
        sessionId: SESSION_ID,
        challengeProfile: session.startProfile,
        returnCodeHash: 'return-hash',
        returnCodeExpiresAt: 1_900_000_090,
      })
    ).resolves.toBe(true);
    await expect(
      repo.recordValidation({
        sessionId: SESSION_ID,
        validateProfile: session.startProfile,
        verdict: 'approved',
        verdictReason: 'approved',
        returnCodeConsumedAt: 1_900_000_000,
        proofAnnotations: { phone_webauthn_attested: true },
        approval: {
          approvedAt: 1_900_000_000,
          approvalTokenHash: 'approval-hash',
          expiresAt: 1_900_000_600,
        },
      })
    ).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0].input.ConditionExpression).toContain(
      'attribute_not_exists(challengeProfile)'
    );
    expect(send.mock.calls[1]?.[0].input.ConditionExpression).toContain(
      'attribute_not_exists(returnCodeConsumedAt)'
    );
  });

  it('consumes approval only when every server binding matches', async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(
      repository(send).consumeApproval({
        sessionId: SESSION_ID,
        cpi: session.cpi,
        token: 'approval-token',
        challengeId: 'checkout_action_123456789',
      })
    ).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      ConditionExpression: expect.stringContaining('merchantChallengeId = :challengeId'),
      ExpressionAttributeValues: expect.objectContaining({
        ':cpi': session.cpi,
        ':hash': hashApprovalToken('approval-token'),
      }),
    });
  });
});
