import { timingSafeEqual } from 'node:crypto';
import { MERCHANT_CHALLENGE_PATTERN } from '@argus-challenge/contracts';
import { parseScopedCpi } from '../assurance/scoped-cpi.js';
import type { ApplicationResponse } from '../http/application-response.js';
import { hashApprovalToken } from './token-hash.js';

const APPROVAL_COOKIE = '__Secure-argus_sso_approval';
const COOKIE_PATH = '/api/sso/approval/redeem';
export const SSO_APPROVAL_TTL_SECONDS = 10 * 60;

interface ApprovalState {
  verdict: 'pending' | 'approved' | 'failed';
  cpi?: string | undefined;
  approvalTokenHash?: string | undefined;
  approvalRedeemedAt?: number | undefined;
}

interface MerchantApprovalState extends ApprovalState {
  merchantSessionId: string;
  merchantCallbackUrl?: string;
  merchantChallengeId?: string;
}

interface ConsumeApprovalInput {
  sessionId: string;
  cpi: string;
  token: string;
  challengeId?: string;
}

interface ApprovalExchangeInput {
  sessionId: string;
  token: string;
  challengeId: string;
  cpi: NonNullable<ReturnType<typeof parseScopedCpi>>;
}

interface ApprovalDependencies<T extends ApprovalState> {
  loadSession(sessionId: string): Promise<T | null>;
  consumeApproval(input: ConsumeApprovalInput): Promise<boolean>;
}

type Response = ApplicationResponse<Record<string, unknown>>;

export { hashApprovalToken };

export function approvalCookie(token: string, maxAgeSeconds: number): string {
  return `${APPROVAL_COOKIE}=${encodeURIComponent(token)}; Path=${COOKIE_PATH}; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Strict`;
}

export function clearApprovalCookie(): string {
  return `${APPROVAL_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}

export function readApprovalCookie(cookies: string[] | undefined): string | null {
  for (const header of cookies ?? []) {
    for (const entry of header.split(';')) {
      const [rawName, ...rawValue] = entry.split('=');
      if (rawName?.trim() !== APPROVAL_COOKIE) continue;
      try {
        return decodeURIComponent(rawValue.join('=').trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function checkApproval(
  state: ApprovalState,
  token: string,
  expectedCpi: string
):
  | 'approved'
  | 'not_approved'
  | 'missing'
  | 'invalid'
  | 'consumed'
  | 'cpi_missing'
  | 'cpi_mismatch' {
  if (state.verdict !== 'approved') return 'not_approved';
  if (state.approvalRedeemedAt) return 'consumed';
  if (!state.approvalTokenHash) return 'missing';
  const expected = Buffer.from(state.approvalTokenHash, 'hex');
  const actual = Buffer.from(hashApprovalToken(token), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return 'invalid';
  }
  if (!state.cpi) return 'cpi_missing';
  return state.cpi === expectedCpi ? 'approved' : 'cpi_mismatch';
}

export function createSsoApprovalRedemptionHandler(
  dependencies: ApprovalDependencies<ApprovalState>
) {
  return async (body: Record<string, unknown>, cookies?: string[]): Promise<Response> => {
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 129) : '';
    if (body.cpi === undefined) return { status: 400, body: { error: 'missing_cpi' } };
    const cpi = parseScopedCpi(body.cpi);
    if (!cpi) return { status: 400, body: { error: 'invalid_cpi' } };
    const token = readApprovalCookie(cookies);
    if (!sessionId || sessionId.length > 128 || !token) {
      return { status: 401, body: { error: 'sso_approval_missing' } };
    }
    const session = await dependencies.loadSession(sessionId);
    if (!session) return { status: 410, body: { error: 'sso_session_not_found' } };
    const check = checkApproval(session, token, cpi.cpi);
    if (check !== 'approved') {
      return { status: 409, body: { error: `sso_approval_${check}` } };
    }
    if (!(await dependencies.consumeApproval({ sessionId, cpi: cpi.cpi, token }))) {
      return { status: 409, body: { error: 'sso_approval_invalid_or_consumed' } };
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      cookies: [clearApprovalCookie()],
      body: { verdict: 'approved', reason: 'approved', cpi: cpi.cpi, scope: cpi.scope },
    };
  };
}

export function createSsoApprovalExchangeHandler(
  dependencies: ApprovalDependencies<MerchantApprovalState>
) {
  return async (body: Record<string, unknown>): Promise<Response> => {
    const input = readApprovalExchange(body);
    if (!input) return { status: 400, body: { error: 'sso_approval_binding_required' } };
    return exchangeApproval(input, dependencies);
  };
}

function readApprovalExchange(body: Record<string, unknown>): ApprovalExchangeInput | null {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const token = typeof body.code === 'string' && body.code.length <= 256 ? body.code : '';
  const challengeId =
    typeof body.challengeId === 'string' && MERCHANT_CHALLENGE_PATTERN.test(body.challengeId)
      ? body.challengeId
      : '';
  const cpi = parseScopedCpi(body.cpi);
  return sessionId && token && challengeId && cpi ? { sessionId, token, challengeId, cpi } : null;
}

async function exchangeApproval(
  input: ApprovalExchangeInput,
  dependencies: ApprovalDependencies<MerchantApprovalState>
): Promise<Response> {
  const session = await dependencies.loadSession(input.sessionId);
  if (!session) return { status: 410, body: { error: 'sso_session_not_found' } };
  if (!session.merchantCallbackUrl || !session.merchantChallengeId) {
    return { status: 409, body: { error: 'sso_approval_not_merchant_bound' } };
  }
  if (session.merchantChallengeId !== input.challengeId) {
    return { status: 409, body: { error: 'sso_approval_challenge_mismatch' } };
  }
  const check = checkApproval(session, input.token, input.cpi.cpi);
  if (check !== 'approved') {
    return { status: 409, body: { error: `sso_approval_${check}` } };
  }
  if (
    !(await dependencies.consumeApproval({
      sessionId: input.sessionId,
      cpi: input.cpi.cpi,
      token: input.token,
      challengeId: input.challengeId,
    }))
  ) {
    return { status: 409, body: { error: 'sso_approval_invalid_or_consumed' } };
  }
  return {
    status: 200,
    body: {
      valid: true,
      passed: true,
      verdict: 'approved',
      reason: 'approved',
      merchantSessionId: session.merchantSessionId,
      cpi: input.cpi.cpi,
      scope: input.cpi.scope,
      challengeId: input.challengeId,
    },
  };
}
